# Phase 2 스크래퍼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 7개 커뮤니티 베스트 게시판에서 Playwright로 게시글을 수집하고 rank+char 합산 점수로 하루 1개를 선택해 DB에 저장한다.

**Architecture:** Playwright 헤드리스 브라우저로 7개 사이트를 순차 수집, 사이트 내 베스트 순위 점수와 글자수 순위 점수를 합산해 최고점 1개를 선택, scraped_posts 테이블에 저장 후 pipeline_runs.source_url/source_content 반환.

**Tech Stack:** playwright, drizzle-orm/better-sqlite3, nanoid, vitest

---

## 파일 구조

```
src/
  lib/
    types.ts                     ← PostSource 타입 업데이트
  scraper/
    types.ts                     ← RawPost 인터페이스, SiteScraper 타입 (신규)
    browser.ts                   ← Playwright 인스턴스 생성 (신규)
    select.ts                    ← 필터 + 점수 계산 + 선택 (신규)
    sites/
      nate.ts                    ← 네이트판 베스트 (신규)
      bobae.ts                   ← 보배드림 인기게시물 (신규)
      fmkorea.ts                 ← 에펨코리아 베스트 (신규)
      humoruniv.ts               ← 오늘의유머 베스트 (신규)
      cook82.ts                  ← 82cook 베스트 (신규)
      theqoo.ts                  ← 더쿠 인기게시물 (신규)
      ruliweb.ts                 ← 루리웹 베스트 (신규)
  worker/
    steps/
      scrape.ts                  ← stub 교체, 오케스트레이션 (수정)
tests/
  scraper/
    select.test.ts               ← 점수 계산 단위 테스트 (신규)
```

---

### Task 1: Playwright 설치 + PostSource 타입 업데이트

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Playwright 설치**

```bash
pnpm add playwright
npx playwright install chromium
```

Expected: `node_modules/playwright` 생성, chromium 다운로드 완료

- [ ] **Step 2: PostSource 타입 업데이트**

`src/lib/types.ts` 의 `PostSource` 를 아래로 교체:

```typescript
export type PostSource =
  | 'nate'
  | 'bobae'
  | 'fmkorea'
  | 'humoruniv'
  | 'cook82'
  | 'theqoo'
  | 'ruliweb'
```

- [ ] **Step 3: 타입 컴파일 확인**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add package.json pnpm-lock.yaml src/lib/types.ts
git commit -m "feat: playwright 설치 + PostSource 7개 사이트로 확장"
```

---

### Task 2: scraper/types.ts + scraper/browser.ts

**Files:**
- Create: `src/scraper/types.ts`
- Create: `src/scraper/browser.ts`

- [ ] **Step 1: src/scraper/types.ts 생성**

```typescript
import type { Browser } from 'playwright'

export interface RawPost {
  source: string
  url: string
  title: string
  content: string
  likes: number
  comments: number
  rankInSite: number // 1-based, 베스트 게시판 내 순위
}

export type SiteScraper = (browser: Browser) => Promise<RawPost[]>
```

- [ ] **Step 2: src/scraper/browser.ts 생성**

```typescript
import { chromium } from 'playwright'
import type { Browser } from 'playwright'

export async function createBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
}
```

- [ ] **Step 3: 타입 컴파일 확인**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/scraper/types.ts src/scraper/browser.ts
git commit -m "feat: scraper 기반 타입 + Playwright 브라우저 팩토리"
```

---

### Task 3: scraper/select.ts (TDD)

**Files:**
- Create: `tests/scraper/select.test.ts`
- Create: `src/scraper/select.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/scraper/select.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { selectBestPost } from '../../src/scraper/select'
import type { RawPost } from '../../src/scraper/types'

function post(source: string, rankInSite: number, contentLength: number, url: string): RawPost {
  return {
    source,
    url,
    title: `제목 ${url}`,
    content: 'A'.repeat(contentLength),
    likes: 100,
    comments: 10,
    rankInSite,
  }
}

describe('selectBestPost', () => {
  it('500자 미만 글을 필터링한다', () => {
    const posts = [
      post('nate', 1, 300, 'u1'), // 필터 제외
      post('nate', 2, 600, 'u2'), // 통과
    ]
    expect(selectBestPost(posts).url).toBe('u2')
  })

  it('모든 글이 500자 미만이면 에러를 던진다', () => {
    expect(() => selectBestPost([post('nate', 1, 100, 'u1')])).toThrow('수집된 글 없음')
  })

  it('빈 배열이면 에러를 던진다', () => {
    expect(() => selectBestPost([])).toThrow('수집된 글 없음')
  })

  it('total_score 최고점을 선택한다', () => {
    // u1: rank=1(10pt), char rank=1(10pt) = 20pt
    // u2: rank=1(10pt), char rank=1(10pt) = 20pt  →  동점, u1이 더 김
    const posts = [
      post('nate',  1, 2000, 'u1'), // rank=10, char=10 → 20
      post('bobae', 1,  800, 'u2'), // rank=10, char=10 → 20 (동점, 짧음)
    ]
    expect(selectBestPost(posts).url).toBe('u1')
  })

  it('동점 시 글자수 긴 것을 선택한다', () => {
    // 같은 사이트, rank 1위는 짧고 rank 2위는 김
    // u1: rank=1(10pt), char rank=2(9pt) = 19pt
    // u2: rank=2(9pt),  char rank=1(10pt) = 19pt  → 동점, u2가 더 김
    const posts = [
      post('nate', 1,  500, 'u1'),
      post('nate', 2, 1200, 'u2'),
    ]
    expect(selectBestPost(posts).url).toBe('u2')
  })

  it('사이트 실패(빈 결과)해도 다른 사이트 글로 선택한다', () => {
    const posts = [
      post('nate',  1, 100,  'u1'), // 필터 제외
      post('bobae', 1, 1000, 'u2'), // 통과
    ]
    expect(selectBestPost(posts).url).toBe('u2')
  })

  it('rank_score: 1위=10, 2위=9, 10위=1', () => {
    const posts = Array.from({ length: 10 }, (_, i) =>
      post('nate', i + 1, 1000 - i * 50, `u${i + 1}`)
    )
    // u1: rank=1(10pt), char rank=1(10pt) = 20 → 최고점
    expect(selectBestPost(posts).url).toBe('u1')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm test tests/scraper/select.test.ts
```

Expected: FAIL — `Cannot find module '../../src/scraper/select'`

- [ ] **Step 3: select.ts 구현**

`src/scraper/select.ts`:

```typescript
import type { RawPost } from './types'

const MIN_CHARS = 500

export function selectBestPost(posts: RawPost[]): RawPost {
  const filtered = posts.filter(p => p.content.length >= MIN_CHARS)

  if (filtered.length === 0) {
    throw new Error('수집된 글 없음 — 모든 사이트 실패 또는 500자 미만')
  }

  // 사이트별 글자수 순위 계산을 위해 그룹화
  const bySite = new Map<string, RawPost[]>()
  for (const p of filtered) {
    if (!bySite.has(p.source)) bySite.set(p.source, [])
    bySite.get(p.source)!.push(p)
  }
  for (const sitePosts of bySite.values()) {
    sitePosts.sort((a, b) => b.content.length - a.content.length)
  }

  const scored = filtered.map(p => {
    const rankScore = Math.max(1, 11 - p.rankInSite)
    const sitePosts = bySite.get(p.source)!
    const charRank = sitePosts.findIndex(sp => sp.url === p.url) + 1
    const charScore = Math.max(1, 11 - charRank)
    return { post: p, totalScore: rankScore + charScore }
  })

  scored.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
    return b.post.content.length - a.post.content.length
  })

  return scored[0].post
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test tests/scraper/select.test.ts
```

Expected: 6 tests passed

- [ ] **Step 5: 커밋**

```bash
git add src/scraper/select.ts tests/scraper/select.test.ts
git commit -m "feat: selectBestPost — rank+char 합산 점수 선택 로직 (TDD)"
```

---

### Task 4: 네이트판 scraper (nate.ts)

**Files:**
- Create: `src/scraper/sites/nate.ts`

- [ ] **Step 1: nate.ts 구현**

```typescript
import type { Browser } from 'playwright'
import type { RawPost } from '../types'

export async function scrapeNate(browser: Browser): Promise<RawPost[]> {
  const page = await browser.newPage()
  try {
    await page.goto('https://nate.com/talk/bestList.do?type=allBest', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    const items = await page.$$eval('ul.list_type2 li, ul.normalList li', (els) =>
      els.slice(0, 10).map((el, i) => {
        const a = el.querySelector('strong.tit a, a.tit') as HTMLAnchorElement | null
        const likesEl = el.querySelector('span.emHit, em.u_cnt._recomBtn')
        const commentsEl = el.querySelector('span.emReply, em.u_cnt._replyBtn')
        return {
          url: a?.href ?? '',
          title: a?.textContent?.trim() ?? '',
          likes: parseInt(likesEl?.textContent?.replace(/[^0-9]/g, '') ?? '0', 10),
          comments: parseInt(commentsEl?.textContent?.replace(/[^0-9]/g, '') ?? '0', 10),
          rankInSite: i + 1,
        }
      })
    )

    const posts: RawPost[] = []
    for (const item of items.filter(it => it.url)) {
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const content = await page.$eval(
          'div.artCont, div.articleContent, div#article_body',
          el => el.textContent ?? ''
        ).catch(() => '')
        if (content.trim()) {
          posts.push({ source: 'nate', ...item, content: content.trim() })
        }
        await page.waitForTimeout(1200)
      } catch {
        // 개별 게시글 실패 시 스킵
      }
    }
    return posts
  } finally {
    await page.close()
  }
}
```

- [ ] **Step 2: 타입 컴파일 확인**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 수동 통합 테스트 (선택적)**

```bash
SCRAPER_TEST=1 pnpm tsx -e "
import { createBrowser } from './src/scraper/browser'
import { scrapeNate } from './src/scraper/sites/nate'
const b = await createBrowser()
const posts = await scrapeNate(b)
await b.close()
console.log(posts.length, '개', posts[0]?.title, posts[0]?.content.length + '자')
"
```

Expected: 1~10개 posts, 제목과 글자수 출력

- [ ] **Step 4: 커밋**

```bash
git add src/scraper/sites/nate.ts
git commit -m "feat: 네이트판 베스트 scraper"
```

---

### Task 5: 보배드림 scraper (bobae.ts)

**Files:**
- Create: `src/scraper/sites/bobae.ts`

- [ ] **Step 1: bobae.ts 구현**

```typescript
import type { Browser } from 'playwright'
import type { RawPost } from '../types'

export async function scrapeBobae(browser: Browser): Promise<RawPost[]> {
  const page = await browser.newPage()
  try {
    await page.goto('https://www.bobaedream.co.kr/best?code=freeb', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    const items = await page.$$eval('table.board-list tbody tr, ul.bestn li', (els) =>
      els.slice(0, 10).map((el, i) => {
        const a = el.querySelector('td.subject a, a.tit') as HTMLAnchorElement | null
        const likesEl = el.querySelector('td.no em, span.up_num')
        const commentsEl = el.querySelector('td.replies, span.cmt_num')
        return {
          url: a ? (a.href.startsWith('http') ? a.href : 'https://www.bobaedream.co.kr' + a.getAttribute('href')) : '',
          title: a?.textContent?.trim() ?? '',
          likes: parseInt(likesEl?.textContent?.replace(/[^0-9]/g, '') ?? '0', 10),
          comments: parseInt(commentsEl?.textContent?.replace(/[^0-9]/g, '') ?? '0', 10),
          rankInSite: i + 1,
        }
      })
    )

    const posts: RawPost[] = []
    for (const item of items.filter(it => it.url)) {
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const content = await page.$eval(
          'div.bodyCont, div.view_content, #post_content',
          el => el.textContent ?? ''
        ).catch(() => '')
        if (content.trim()) {
          posts.push({ source: 'bobae', ...item, content: content.trim() })
        }
        await page.waitForTimeout(1200)
      } catch {
        // 개별 게시글 실패 시 스킵
      }
    }
    return posts
  } finally {
    await page.close()
  }
}
```

- [ ] **Step 2: 타입 컴파일 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add src/scraper/sites/bobae.ts
git commit -m "feat: 보배드림 인기게시물 scraper"
```

---

### Task 6: 에펨코리아 scraper (fmkorea.ts)

**Files:**
- Create: `src/scraper/sites/fmkorea.ts`

- [ ] **Step 1: fmkorea.ts 구현**

```typescript
import type { Browser } from 'playwright'
import type { RawPost } from '../types'

export async function scrapeFmkorea(browser: Browser): Promise<RawPost[]> {
  const page = await browser.newPage()
  try {
    await page.goto('https://www.fmkorea.com/best', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    const items = await page.$$eval('ul.li > li, div.best_list li', (els) =>
      els.slice(0, 10).map((el, i) => {
        const a = el.querySelector('h3.title a, p.title a') as HTMLAnchorElement | null
        const likesEl = el.querySelector('span.recomend, em.recomend')
        const commentsEl = el.querySelector('span.comment_count, a.comment')
        return {
          url: a ? (a.href.startsWith('http') ? a.href : 'https://www.fmkorea.com' + a.getAttribute('href')) : '',
          title: a?.textContent?.trim() ?? '',
          likes: parseInt(likesEl?.textContent?.replace(/[^0-9]/g, '') ?? '0', 10),
          comments: parseInt(commentsEl?.textContent?.replace(/[^0-9]/g, '') ?? '0', 10),
          rankInSite: i + 1,
        }
      })
    )

    const posts: RawPost[] = []
    for (const item of items.filter(it => it.url)) {
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const content = await page.$eval(
          'div.xe_content, div.read_content',
          el => el.textContent ?? ''
        ).catch(() => '')
        if (content.trim()) {
          posts.push({ source: 'fmkorea', ...item, content: content.trim() })
        }
        await page.waitForTimeout(1200)
      } catch {
        // 개별 게시글 실패 시 스킵
      }
    }
    return posts
  } finally {
    await page.close()
  }
}
```

- [ ] **Step 2: 타입 컴파일 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add src/scraper/sites/fmkorea.ts
git commit -m "feat: 에펨코리아 베스트 scraper"
```

---

### Task 7: 오늘의유머 scraper (humoruniv.ts)

**Files:**
- Create: `src/scraper/sites/humoruniv.ts`

- [ ] **Step 1: humoruniv.ts 구현**

```typescript
import type { Browser } from 'playwright'
import type { RawPost } from '../types'

export async function scrapeHumoruniv(browser: Browser): Promise<RawPost[]> {
  const page = await browser.newPage()
  try {
    await page.goto('https://www.humoruniv.com/board/humor/list.html?table=pds', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    const items = await page.$$eval('table tbody tr, ul.hun-listWrap li', (els) =>
      els.filter(el => el.querySelector('a')).slice(0, 10).map((el, i) => {
        const a = el.querySelector('td.subject a, a.title, td.tit a') as HTMLAnchorElement | null
        const likesEl = el.querySelector('td.up, span.hun-up, em.up')
        const commentsEl = el.querySelector('td.reply, span.reply_cnt')
        return {
          url: a ? (a.href.startsWith('http') ? a.href : 'https://www.humoruniv.com' + a.getAttribute('href')) : '',
          title: a?.textContent?.trim() ?? '',
          likes: parseInt(likesEl?.textContent?.replace(/[^0-9]/g, '') ?? '0', 10),
          comments: parseInt(commentsEl?.textContent?.replace(/[^0-9]/g, '') ?? '0', 10),
          rankInSite: i + 1,
        }
      })
    )

    const posts: RawPost[] = []
    for (const item of items.filter(it => it.url)) {
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const content = await page.$eval(
          'div.hun-view-cont, div.viewerContent, div.view_content',
          el => el.textContent ?? ''
        ).catch(() => '')
        if (content.trim()) {
          posts.push({ source: 'humoruniv', ...item, content: content.trim() })
        }
        await page.waitForTimeout(1200)
      } catch {
        // 개별 게시글 실패 시 스킵
      }
    }
    return posts
  } finally {
    await page.close()
  }
}
```

- [ ] **Step 2: 타입 컴파일 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add src/scraper/sites/humoruniv.ts
git commit -m "feat: 오늘의유머 베스트 scraper"
```

---

### Task 8: 82cook scraper (cook82.ts)

**Files:**
- Create: `src/scraper/sites/cook82.ts`

- [ ] **Step 1: cook82.ts 구현**

```typescript
import type { Browser } from 'playwright'
import type { RawPost } from '../types'

export async function scrapeCook82(browser: Browser): Promise<RawPost[]> {
  const page = await browser.newPage()
  try {
    await page.goto('https://www.82cook.com/entiz/list.php?bn=15', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    const items = await page.$$eval('table.list_table tbody tr, ul.list_ul li', (els) =>
      els.filter(el => el.querySelector('a')).slice(0, 10).map((el, i) => {
        const a = el.querySelector('td.tit a, td.subject a, a.tit') as HTMLAnchorElement | null
        const likesEl = el.querySelector('td.like, span.like_cnt')
        const commentsEl = el.querySelector('td.reply, span.cmt')
        return {
          url: a ? (a.href.startsWith('http') ? a.href : 'https://www.82cook.com' + a.getAttribute('href')) : '',
          title: a?.textContent?.trim() ?? '',
          likes: parseInt(likesEl?.textContent?.replace(/[^0-9]/g, '') ?? '0', 10),
          comments: parseInt(commentsEl?.textContent?.replace(/[^0-9]/g, '') ?? '0', 10),
          rankInSite: i + 1,
        }
      })
    )

    const posts: RawPost[] = []
    for (const item of items.filter(it => it.url)) {
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const content = await page.$eval(
          'div.cnt_area, div#post_content, div.read_body',
          el => el.textContent ?? ''
        ).catch(() => '')
        if (content.trim()) {
          posts.push({ source: 'cook82', ...item, content: content.trim() })
        }
        await page.waitForTimeout(1200)
      } catch {
        // 개별 게시글 실패 시 스킵
      }
    }
    return posts
  } finally {
    await page.close()
  }
}
```

- [ ] **Step 2: 타입 컴파일 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add src/scraper/sites/cook82.ts
git commit -m "feat: 82cook 베스트 scraper"
```

---

### Task 9: 더쿠 scraper (theqoo.ts)

**Files:**
- Create: `src/scraper/sites/theqoo.ts`

- [ ] **Step 1: theqoo.ts 구현**

```typescript
import type { Browser } from 'playwright'
import type { RawPost } from '../types'

export async function scrapeTheqoo(browser: Browser): Promise<RawPost[]> {
  const page = await browser.newPage()
  try {
    // 더쿠는 이용약관 팝업이 있을 수 있음 — dismiss 시도
    await page.goto('https://theqoo.net/hot', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await page.locator('button:has-text("확인"), button:has-text("동의")').click({ timeout: 3000 }).catch(() => {})

    const items = await page.$$eval('table.theqoo_board_table tbody tr, ul li.li_hot', (els) =>
      els.filter(el => el.querySelector('a')).slice(0, 10).map((el, i) => {
        const a = el.querySelector('td.title a, a.title') as HTMLAnchorElement | null
        const likesEl = el.querySelector('td.recom, span.recom')
        const commentsEl = el.querySelector('td.reply, span.comment')
        return {
          url: a ? (a.href.startsWith('http') ? a.href : 'https://theqoo.net' + a.getAttribute('href')) : '',
          title: a?.textContent?.trim() ?? '',
          likes: parseInt(likesEl?.textContent?.replace(/[^0-9]/g, '') ?? '0', 10),
          comments: parseInt(commentsEl?.textContent?.replace(/[^0-9]/g, '') ?? '0', 10),
          rankInSite: i + 1,
        }
      })
    )

    const posts: RawPost[] = []
    for (const item of items.filter(it => it.url)) {
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const content = await page.$eval(
          'div.xe_content, div.read_body',
          el => el.textContent ?? ''
        ).catch(() => '')
        if (content.trim()) {
          posts.push({ source: 'theqoo', ...item, content: content.trim() })
        }
        await page.waitForTimeout(1200)
      } catch {
        // 개별 게시글 실패 시 스킵
      }
    }
    return posts
  } finally {
    await page.close()
  }
}
```

- [ ] **Step 2: 타입 컴파일 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add src/scraper/sites/theqoo.ts
git commit -m "feat: 더쿠 인기게시물 scraper"
```

---

### Task 10: 루리웹 scraper (ruliweb.ts)

**Files:**
- Create: `src/scraper/sites/ruliweb.ts`

- [ ] **Step 1: ruliweb.ts 구현**

```typescript
import type { Browser } from 'playwright'
import type { RawPost } from '../types'

export async function scrapeRuliweb(browser: Browser): Promise<RawPost[]> {
  const page = await browser.newPage()
  try {
    await page.goto('https://bbs.ruliweb.com/best/board/300143', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    const items = await page.$$eval('table.board_list_table tbody tr.table_body', (els) =>
      els.slice(0, 10).map((el, i) => {
        const a = el.querySelector('td.subject a.subject_link, td.title a') as HTMLAnchorElement | null
        const likesEl = el.querySelector('td.recom, span.recom_num')
        const commentsEl = el.querySelector('td.reply_count, span.cmt')
        return {
          url: a?.href ?? '',
          title: a?.textContent?.trim() ?? '',
          likes: parseInt(likesEl?.textContent?.replace(/[^0-9]/g, '') ?? '0', 10),
          comments: parseInt(commentsEl?.textContent?.replace(/[^0-9]/g, '') ?? '0', 10),
          rankInSite: i + 1,
        }
      })
    )

    const posts: RawPost[] = []
    for (const item of items.filter(it => it.url)) {
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const content = await page.$eval(
          'div.view_content, div.board_main_text',
          el => el.textContent ?? ''
        ).catch(() => '')
        if (content.trim()) {
          posts.push({ source: 'ruliweb', ...item, content: content.trim() })
        }
        await page.waitForTimeout(1200)
      } catch {
        // 개별 게시글 실패 시 스킵
      }
    }
    return posts
  } finally {
    await page.close()
  }
}
```

- [ ] **Step 2: 타입 컴파일 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add src/scraper/sites/ruliweb.ts
git commit -m "feat: 루리웹 베스트 scraper"
```

---

### Task 11: scrape.ts 오케스트레이션 (stub 교체)

**Files:**
- Modify: `src/worker/steps/scrape.ts`

- [ ] **Step 1: scrape.ts 전체 교체**

```typescript
import { inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../../db'
import { scrapedPosts } from '../../db/schema'
import { createBrowser } from '../../scraper/browser'
import { selectBestPost } from '../../scraper/select'
import { scrapeBobae } from '../../scraper/sites/bobae'
import { scrapeCook82 } from '../../scraper/sites/cook82'
import { scrapeFmkorea } from '../../scraper/sites/fmkorea'
import { scrapeHumoruniv } from '../../scraper/sites/humoruniv'
import { scrapeNate } from '../../scraper/sites/nate'
import { scrapeRuliweb } from '../../scraper/sites/ruliweb'
import { scrapeTheqoo } from '../../scraper/sites/theqoo'
import type { RawPost } from '../../scraper/types'
import type { PipelineRun } from '../../lib/types'
import { log } from '../logger'

const SCRAPERS = [
  { name: 'nate',      fn: scrapeNate },
  { name: 'bobae',     fn: scrapeBobae },
  { name: 'fmkorea',   fn: scrapeFmkorea },
  { name: 'humoruniv', fn: scrapeHumoruniv },
  { name: 'cook82',    fn: scrapeCook82 },
  { name: 'theqoo',    fn: scrapeTheqoo },
  { name: 'ruliweb',   fn: scrapeRuliweb },
] as const

export async function runScrape(run: PipelineRun): Promise<Partial<PipelineRun>> {
  const browser = await createBrowser()
  const allPosts: RawPost[] = []

  try {
    for (const { name, fn } of SCRAPERS) {
      try {
        log(`[scrape] ${name} 수집 시작`)
        const posts = await fn(browser)
        log(`[scrape] ${name} ${posts.length}개 수집`)
        allPosts.push(...posts)
      } catch (err) {
        log(`[scrape] ${name} 실패: ${(err as Error).message}`)
      }
    }
  } finally {
    await browser.close()
  }

  // 이미 DB에 있는 URL 조회
  const allUrls = allPosts.map(p => p.url).filter(Boolean)
  const existingSet = new Set<string>()
  if (allUrls.length > 0) {
    const existing = await db
      .select({ url: scrapedPosts.original_url })
      .from(scrapedPosts)
      .where(inArray(scrapedPosts.original_url, allUrls))
    for (const r of existing) existingSet.add(r.url)
  }

  // 중복 제거 + 글자수 필터는 selectBestPost 내부에서 처리
  const newPosts = allPosts.filter(p => p.url && !existingSet.has(p.url))

  const selected = selectBestPost(newPosts) // 빈 배열이면 내부에서 throw

  // 신규 글 전체 저장 (선택된 글은 used=1)
  const now = Math.floor(Date.now() / 1000)
  for (const p of newPosts.filter(np => np.content.length >= 500)) {
    await db.insert(scrapedPosts).values({
      id: nanoid(),
      source: p.source,
      original_url: p.url,
      title: p.title,
      content: p.content,
      likes: p.likes,
      comments: p.comments,
      scraped_at: now,
      used: p.url === selected.url ? 1 : 0,
      pipeline_run_id: p.url === selected.url ? run.id : null,
    }).onConflictDoNothing()
  }

  log(`[scrape] 선택: [${selected.source}] ${selected.title} (${selected.content.length}자)`)

  return {
    source_url: selected.url,
    source_content: selected.content,
  }
}
```

- [ ] **Step 2: 타입 컴파일 확인**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 전체 테스트 통과 확인**

```bash
pnpm test
```

Expected: 모든 기존 테스트 + select 테스트 통과

- [ ] **Step 4: 커밋**

```bash
git add src/worker/steps/scrape.ts
git commit -m "feat: scrape 스텝 구현 — 7개 사이트 수집 + rank+char 선택"
```

---

### Task 12: 통합 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트 최종 확인**

```bash
pnpm test
```

Expected: 전체 테스트 통과 (기존 5개 + select 6개 = 최소 11개)

- [ ] **Step 2: 워커 실행 (스크래핑 실제 동작 확인)**

```bash
pnpm worker
```

Expected 로그:
```
[scrape] nate 수집 시작
[scrape] nate N개 수집
...
[scrape] 선택: [사이트명] 제목 (글자수자)
[scrape] 완료
[script] 시작
[script] 실패: script step not implemented — Phase 3에서 구현
```

scrape 스텝이 완료되고 script stub에서 실패하면 정상.

- [ ] **Step 3: DB 확인**

```bash
pnpm worker:status
```

Expected: 오늘 날짜 FAILED (script 스텝), `source_url` 에 URL 채워짐 확인

- [ ] **Step 4: 선택자 오류 발생 시 수정**

특정 사이트에서 0개 수집되면 해당 사이트 scraper의 CSS 선택자를 Playwright로 직접 확인:

```bash
pnpm tsx -e "
import { chromium } from 'playwright'
const b = await chromium.launch({ headless: false })
const p = await b.newPage()
await p.goto('https://www.fmkorea.com/best')
await p.pause() // DevTools에서 선택자 확인
await b.close()
"
```

확인 후 해당 사이트 `src/scraper/sites/*.ts` 선택자 수정 + 재실행.

- [ ] **Step 5: 최종 커밋**

```bash
git add -A
git commit -m "feat: Phase 2 스크래퍼 완료 — 7개 사이트 베스트 수집"
```
