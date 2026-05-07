# Silver Autopilot — Phase 2: 스크래퍼 설계 스펙

**날짜**: 2026-05-07
**범위**: 7개 커뮤니티 베스트 게시글 수집, 점수 기반 선택, scraped_posts DB 저장
**제외**: 콘텐츠 분류, AI 적합도 판단 (Phase 3 이후)

---

## 1. 목표

매일 7개 커뮤니티의 베스트 게시판에서 인기 + 내용 깊이를 합산한 점수로 가장 좋은 글 1개를 선택해 파이프라인에 공급한다.

---

## 2. 수집 대상

| # | 사이트 | source 코드 | 타겟 게시판 |
|---|--------|------------|------------|
| 1 | 네이트판 | `nate` | 일간 베스트 |
| 2 | 보배드림 | `bobae` | 인기게시물 |
| 3 | 에펨코리아 | `fmkorea` | 베스트게시물 |
| 4 | 오늘의유머 | `humoruniv` | 베스트 |
| 5 | 82cook | `cook82` | 베스트글 |
| 6 | 더쿠 | `theqoo` | 인기 게시물 |
| 7 | 루리웹 | `ruliweb` | 베스트 |

---

## 3. 수집 도구

**Playwright** (헤드리스 브라우저)

- 이유: 하루 1회 실행이라 속도 무관, JS 렌더링 사이트 안정 대응, 7개 사이트 단일 방식으로 커버
- 브라우저 인스턴스 1개를 파이프라인 전체에서 재사용 (비용 최소화)
- 각 사이트 요청 사이 1~2초 딜레이 (차단 방지)

---

## 4. 수집 흐름

```
runScrape(run)
  └─ browser.ts: Playwright 인스턴스 생성
       └─ 7개 사이트 순차 순회
            └─ 각 사이트 scraper (sites/*.ts)
                 ├─ 베스트 게시판 목록 페이지 파싱 → 상위 10개 URL + 제목 + 좋아요 + 댓글 수
                 └─ 각 게시글 본문 페이지 파싱 → content (전문)
  └─ select.ts: 필터 → 점수 계산 → 1개 선택
  └─ DB 저장: scraped_posts (수집분 전체) + pipeline_runs 업데이트
```

---

## 5. 필터 기준

1. **글자수 ≥ 500자**: 재창작 최소 재료. 미달 시 제외
2. **중복 URL 제외**: `scraped_posts.original_url` UNIQUE 제약으로 이미 수집된 URL 스킵
3. **키워드 필터 없음**: 베스트 진입 자체가 커뮤니티 인기 검증 → 주제 무관하게 수집

---

## 6. 점수 계산 및 선택

### 6.1 점수 산식

각 사이트별로 수집된 글(최대 10개, 필터 통과분) 내에서 두 점수를 계산한다.

```
rank_score: 사이트 내 베스트 순위
  1위 = 10점, 2위 = 9점, ..., 10위 = 1점

char_score: 사이트 내 글자수 순위
  가장 긴 글 = 10점, 두 번째 = 9점, ..., 가장 짧은 = 1점

total_score = rank_score + char_score  (범위: 2 ~ 20)
```

### 6.2 선택

전체 수집분(최대 70개, 필터 통과분)에서 `total_score` 최고점 1개 선택.

동점 시: 글자수가 더 긴 것 우선.

### 6.3 선택 실패 처리

필터 통과 글이 0개인 경우 (모든 사이트 수집 실패 등): `scrape` 스텝 에러로 파이프라인 중단.

---

## 7. DB 저장

### 7.1 scraped_posts

수집된 전체 글(필터 통과분)을 모두 저장. `used = 0`으로 초기화.
선택된 1개: `used = 1`, `pipeline_run_id = run.id`

### 7.2 pipeline_runs 업데이트

```typescript
{
  source_url: 선택된 글 URL,
  source_content: 선택된 글 본문 전문,
}
```

---

## 8. 파일 구조

```
src/
  scraper/
    browser.ts          Playwright 인스턴스 생성/종료 (singleton)
    types.ts            RawPost 인터페이스
    select.ts           필터 + 점수 계산 + 선택
    sites/
      nate.ts           네이트판 베스트
      bobae.ts          보배드림 인기게시물
      fmkorea.ts        에펨코리아 베스트
      humoruniv.ts      오늘의유머 베스트
      cook82.ts         82cook 베스트
      theqoo.ts         더쿠 인기게시물
      ruliweb.ts        루리웹 베스트
  worker/
    steps/
      scrape.ts         기존 stub 교체 (runScrape 구현)
```

---

## 9. 인터페이스

```typescript
// src/scraper/types.ts
export interface RawPost {
  source: string        // 'nate' | 'bobae' | ...
  url: string
  title: string
  content: string
  likes: number
  comments: number
  rankInSite: number    // 1-based, 베스트 게시판 내 순위
}

// 각 sites/*.ts 가 구현하는 함수
export type SiteScraper = (browser: Browser) => Promise<RawPost[]>
```

---

## 10. 에러 처리

- 사이트별 개별 try/catch: 1개 사이트 실패해도 나머지 진행
- 사이트 실패 시 로그만 기록 (`[scrape] nate 실패: ...`)
- 전체 수집 결과 0개면 스텝 에러로 파이프라인 중단
- Playwright 인스턴스는 finally 블록에서 반드시 close

---

## 11. 환경변수

Phase 2에서 추가되는 환경변수 없음. Playwright는 로컬 설치.

```bash
pnpm add -D playwright
npx playwright install chromium
```

---

## 12. 테스트

- `tests/scraper/select.test.ts`: 점수 계산, 동점 처리, 필터 로직 단위 테스트
- 각 사이트 scraper는 실제 네트워크 없이 테스트 불가 → 통합 테스트 별도 (`tests/scraper/sites/*.test.ts`, `.env.test` 에서 `SCRAPER_TEST=1` 플래그로 수동 실행)

---

## 13. Phase 2 완료 기준

- [ ] 7개 사이트 scraper 구현 및 실제 수집 확인
- [ ] 필터 + 점수 계산 단위 테스트 통과
- [ ] `pnpm worker` 실행 시 scrape 스텝 성공, `pipeline_runs.source_url` 채워짐
- [ ] `scraped_posts` 테이블에 수집된 글 저장 확인
- [ ] 사이트 1개 실패해도 나머지로 진행 확인

---

## 14. 다음 단계

Phase 2 완료 후 → Phase 3: 스크립트 생성 (Claude Code CLI, 7,500자)
