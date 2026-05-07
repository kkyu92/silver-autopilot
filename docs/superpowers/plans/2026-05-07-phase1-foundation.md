# Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DB 스키마, 오케스트레이터 뼈대, 로그/에러 추적 시스템을 구축해 파이프라인이 cron에서 실행 가능한 상태를 만든다.

**Architecture:** SQLite + Drizzle ORM으로 `pipeline_runs`/`scraped_posts` 테이블 관리. TypeScript 오케스트레이터(`src/worker/orchestrator.ts`)가 cron 01:17에 tsx로 직접 실행된다. Phase 1에서는 모든 스텝이 stub이므로 scrape 스텝에서 "not implemented" 오류로 종료되고, DB에 에러 정보가 기록된다.

**Tech Stack:** better-sqlite3, drizzle-orm ^0.45, drizzle-kit ^0.31, nanoid, tsx, vitest

---

## File Map

| 파일 | 역할 |
|------|------|
| `src/lib/types.ts` | 공유 타입 (StepName, RunStatus, PipelineRun, ScrapedPost) |
| `src/db/schema.ts` | Drizzle 테이블 정의 |
| `src/db/index.ts` | DB 커넥션 singleton + 자동 migration |
| `drizzle.config.ts` | Drizzle Kit 설정 |
| `src/db/migrations/` | drizzle-kit이 자동 생성 |
| `src/worker/logger.ts` | 타임스탬프 로그 → stdout + 파일 |
| `src/worker/steps/scrape.ts` | stub |
| `src/worker/steps/script.ts` | stub |
| `src/worker/steps/tts.ts` | stub |
| `src/worker/steps/srt.ts` | stub |
| `src/worker/steps/video.ts` | stub |
| `src/worker/steps/thumbnail.ts` | stub |
| `src/worker/steps/upload.ts` | stub |
| `src/worker/orchestrator.ts` | 메인 러너 — 스텝 순차 실행, 에러 시 DB 기록 후 종료 |
| `src/worker/status.ts` | 오늘 상태 + 최근 7일 실행 내역 출력 |
| `src/worker/restart.ts` | 오늘 실패한 run 재시작 |
| `vitest.config.ts` | 테스트 설정 |
| `tests/db/schema.test.ts` | DB 스키마 단위 테스트 |

---

## Task 1: 공유 타입 정의

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// src/lib/types.ts
export const STEPS = [
  'scrape',
  'script',
  'tts',
  'srt',
  'video',
  'thumbnail',
  'upload',
] as const

export type StepName = (typeof STEPS)[number]
export type RunStatus = 'pending' | 'running' | 'failed' | 'done'
export type PostSource = 'nate' | 'naver_cafe' | 'bobae'

export interface PipelineRun {
  id: string
  date: string
  status: RunStatus
  current_step: StepName | null
  error_step: StepName | null
  error_message: string | null
  error_stack: string | null
  source_url: string | null
  source_content: string | null
  script: string | null
  script_title: string | null
  script_description: string | null
  script_tags: string | null
  image_prompt: string | null
  audio_path: string | null
  srt_path: string | null
  background_path: string | null
  video_path: string | null
  thumbnail_path: string | null
  youtube_id: string | null
  created_at: number
  updated_at: number
}

export interface ScrapedPost {
  id: string
  source: PostSource
  original_url: string
  title: string
  content: string
  likes: number
  comments: number
  scraped_at: number
  used: number
  pipeline_run_id: string | null
}
```

- [ ] **Step 2: 타입 컴파일 확인**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/lib/types.ts
git commit -m "feat: 공유 타입 정의 (StepName, PipelineRun, ScrapedPost)"
```

---

## Task 2: Drizzle 스키마 + 설정

**Files:**
- Create: `src/db/schema.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Drizzle 스키마 작성**

```typescript
// src/db/schema.ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const pipelineRuns = sqliteTable('pipeline_runs', {
  id: text('id').primaryKey(),
  date: text('date').notNull().unique(),
  status: text('status').notNull().default('pending'),
  current_step: text('current_step'),
  error_step: text('error_step'),
  error_message: text('error_message'),
  error_stack: text('error_stack'),
  source_url: text('source_url'),
  source_content: text('source_content'),
  script: text('script'),
  script_title: text('script_title'),
  script_description: text('script_description'),
  script_tags: text('script_tags'),
  image_prompt: text('image_prompt'),
  audio_path: text('audio_path'),
  srt_path: text('srt_path'),
  background_path: text('background_path'),
  video_path: text('video_path'),
  thumbnail_path: text('thumbnail_path'),
  youtube_id: text('youtube_id'),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const scrapedPosts = sqliteTable('scraped_posts', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  original_url: text('original_url').notNull().unique(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  scraped_at: integer('scraped_at').notNull(),
  used: integer('used').notNull().default(0),
  pipeline_run_id: text('pipeline_run_id'),
})
```

- [ ] **Step 2: Drizzle Kit 설정**

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/silver-autopilot.db',
  },
})
```

- [ ] **Step 3: 커밋**

```bash
git add src/db/schema.ts drizzle.config.ts
git commit -m "feat: Drizzle 스키마 및 설정 추가"
```

---

## Task 3: Migration 생성 및 적용

**Files:**
- Create: `src/db/migrations/` (drizzle-kit 자동 생성)
- Create: `data/` (DB 파일 저장 디렉토리)

- [ ] **Step 1: data 디렉토리 + .gitignore 준비**

```bash
mkdir -p data logs storage/audio storage/video storage/thumbnail storage/background
touch data/.gitkeep logs/.gitkeep
```

`.gitignore`에 아래 추가:

```
# DB
data/*.db
data/*.db-shm
data/*.db-wal

# Logs
logs/*.log

# Storage
storage/audio/
storage/video/
storage/thumbnail/
storage/background/
```

- [ ] **Step 2: Migration 파일 생성**

```bash
pnpm drizzle-kit generate
```

Expected: `src/db/migrations/0000_*.sql` 파일 생성됨

- [ ] **Step 3: Migration 적용 확인**

```bash
pnpm drizzle-kit migrate
```

Expected: `data/silver-autopilot.db` 생성, 테이블 2개 확인

```bash
# 테이블 확인
sqlite3 data/silver-autopilot.db ".tables"
```

Expected:
```
pipeline_runs  scraped_posts
```

- [ ] **Step 4: 커밋**

```bash
git add src/db/migrations/ data/.gitkeep logs/.gitkeep .gitignore
git commit -m "feat: DB 마이그레이션 생성 및 디렉토리 구조 셋업"
```

---

## Task 4: DB 커넥션 모듈

**Files:**
- Create: `src/db/index.ts`

- [ ] **Step 1: DB 커넥션 작성**

```typescript
// src/db/index.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import fs from 'fs'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data', 'silver-autopilot.db')
const MIGRATIONS_PATH = path.join(process.cwd(), 'src/db/migrations')

function createDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  const sqlite = new Database(DB_PATH)
  sqlite.pragma('journal_mode = WAL')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: MIGRATIONS_PATH })
  return db
}

export const db = createDb()
export type Db = typeof db
```

- [ ] **Step 2: 컴파일 확인**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/db/index.ts
git commit -m "feat: DB 커넥션 singleton 추가"
```

---

## Task 5: DB 스키마 테스트

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/db/schema.test.ts`

- [ ] **Step 1: vitest 설정 작성**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

- [ ] **Step 2: 실패하는 테스트 작성**

```typescript
// tests/db/schema.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { pipelineRuns, scrapedPosts } from '../../src/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import path from 'path'

const MIGRATIONS_PATH = path.join(process.cwd(), 'src/db/migrations')

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  const db = drizzle(sqlite, { schema: { pipelineRuns, scrapedPosts } })
  migrate(db, { migrationsFolder: MIGRATIONS_PATH })
  return { db, sqlite }
}

describe('pipeline_runs 테이블', () => {
  let db: ReturnType<typeof createTestDb>['db']
  let sqlite: Database.Database

  beforeEach(() => {
    const result = createTestDb()
    db = result.db
    sqlite = result.sqlite
  })

  afterEach(() => {
    sqlite.close()
  })

  it('레코드를 삽입하고 조회한다', async () => {
    const now = Math.floor(Date.now() / 1000)
    await db.insert(pipelineRuns).values({
      id: nanoid(),
      date: '2026-05-07',
      status: 'pending',
      current_step: 'scrape',
      created_at: now,
      updated_at: now,
    })

    const rows = await db.select().from(pipelineRuns)
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('2026-05-07')
    expect(rows[0].status).toBe('pending')
    expect(rows[0].current_step).toBe('scrape')
  })

  it('date 컬럼은 unique 제약이 있다', async () => {
    const now = Math.floor(Date.now() / 1000)
    await db.insert(pipelineRuns).values({
      id: nanoid(), date: '2026-05-07', status: 'pending',
      current_step: 'scrape', created_at: now, updated_at: now,
    })

    await expect(
      db.insert(pipelineRuns).values({
        id: nanoid(), date: '2026-05-07', status: 'pending',
        current_step: 'scrape', created_at: now, updated_at: now,
      })
    ).rejects.toThrow()
  })

  it('실패 정보를 기록하고 조회한다', async () => {
    const now = Math.floor(Date.now() / 1000)
    const [run] = await db.insert(pipelineRuns).values({
      id: nanoid(), date: '2026-05-07', status: 'running',
      current_step: 'tts', created_at: now, updated_at: now,
    }).returning()

    await db.update(pipelineRuns)
      .set({
        status: 'failed',
        error_step: 'tts',
        error_message: 'Naver Clova API timeout',
        error_stack: 'Error: timeout\n  at runTts:34',
        updated_at: now,
      })
      .where(eq(pipelineRuns.id, run.id))

    const [updated] = await db.select().from(pipelineRuns)
      .where(eq(pipelineRuns.id, run.id))

    expect(updated.status).toBe('failed')
    expect(updated.error_step).toBe('tts')
    expect(updated.error_message).toBe('Naver Clova API timeout')
    expect(updated.error_stack).toContain('timeout')
  })
})

describe('scraped_posts 테이블', () => {
  let db: ReturnType<typeof createTestDb>['db']
  let sqlite: Database.Database

  beforeEach(() => {
    const result = createTestDb()
    db = result.db
    sqlite = result.sqlite
  })

  afterEach(() => {
    sqlite.close()
  })

  it('게시물을 삽입하고 조회한다', async () => {
    const now = Math.floor(Date.now() / 1000)
    await db.insert(scrapedPosts).values({
      id: nanoid(),
      source: 'nate',
      original_url: 'https://nate.com/post/1',
      title: '치매 시어머니 이야기',
      content: '사연 내용...',
      likes: 150,
      comments: 42,
      scraped_at: now,
    })

    const rows = await db.select().from(scrapedPosts)
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('nate')
    expect(rows[0].used).toBe(0)
  })

  it('original_url은 unique 제약이 있다', async () => {
    const now = Math.floor(Date.now() / 1000)
    await db.insert(scrapedPosts).values({
      id: nanoid(), source: 'nate',
      original_url: 'https://nate.com/post/1',
      title: '제목', content: '내용', scraped_at: now,
    })

    await expect(
      db.insert(scrapedPosts).values({
        id: nanoid(), source: 'nate',
        original_url: 'https://nate.com/post/1',
        title: '제목2', content: '내용2', scraped_at: now,
      })
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
pnpm test tests/db/schema.test.ts
```

Expected: FAIL (vitest.config.ts 없거나 테스트 파일 못 찾음)

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test tests/db/schema.test.ts
```

Expected:
```
✓ tests/db/schema.test.ts (5)
  ✓ pipeline_runs 테이블 (3)
  ✓ scraped_posts 테이블 (2)
```

- [ ] **Step 5: 커밋**

```bash
git add vitest.config.ts tests/db/schema.test.ts
git commit -m "test: DB 스키마 단위 테스트 추가"
```

---

## Task 6: 로거 모듈

**Files:**
- Create: `src/worker/logger.ts`

- [ ] **Step 1: 로거 작성**

```typescript
// src/worker/logger.ts
import fs from 'fs'
import path from 'path'

const LOGS_DIR = path.join(process.cwd(), 'logs')

function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function log(message: string): void {
  const line = `[${ts()}] ${message}\n`
  process.stdout.write(line)
  fs.mkdirSync(LOGS_DIR, { recursive: true })
  fs.appendFileSync(path.join(LOGS_DIR, 'worker.log'), line)
  fs.appendFileSync(path.join(LOGS_DIR, `${today()}.log`), line)
}
```

- [ ] **Step 2: 컴파일 확인**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/worker/logger.ts
git commit -m "feat: 타임스탬프 로거 추가 (stdout + 파일 동시 기록)"
```

---

## Task 7: 스텝 stub 7개

**Files:**
- Create: `src/worker/steps/scrape.ts`
- Create: `src/worker/steps/script.ts`
- Create: `src/worker/steps/tts.ts`
- Create: `src/worker/steps/srt.ts`
- Create: `src/worker/steps/video.ts`
- Create: `src/worker/steps/thumbnail.ts`
- Create: `src/worker/steps/upload.ts`

- [ ] **Step 1: scrape.ts stub 작성**

```typescript
// src/worker/steps/scrape.ts
import type { PipelineRun } from '../../lib/types'

export async function runScrape(_run: PipelineRun): Promise<Partial<PipelineRun>> {
  throw new Error('scrape step not implemented — Phase 2에서 구현')
}
```

- [ ] **Step 2: 나머지 6개 stub 작성**

```typescript
// src/worker/steps/script.ts
import type { PipelineRun } from '../../lib/types'
export async function runScript(_run: PipelineRun): Promise<Partial<PipelineRun>> {
  throw new Error('script step not implemented — Phase 3에서 구현')
}
```

```typescript
// src/worker/steps/tts.ts
import type { PipelineRun } from '../../lib/types'
export async function runTts(_run: PipelineRun): Promise<Partial<PipelineRun>> {
  throw new Error('tts step not implemented — Phase 4에서 구현')
}
```

```typescript
// src/worker/steps/srt.ts
import type { PipelineRun } from '../../lib/types'
export async function runSrt(_run: PipelineRun): Promise<Partial<PipelineRun>> {
  throw new Error('srt step not implemented — Phase 4에서 구현')
}
```

```typescript
// src/worker/steps/video.ts
import type { PipelineRun } from '../../lib/types'
export async function runVideo(_run: PipelineRun): Promise<Partial<PipelineRun>> {
  throw new Error('video step not implemented — Phase 5에서 구현')
}
```

```typescript
// src/worker/steps/thumbnail.ts
import type { PipelineRun } from '../../lib/types'
export async function runThumbnail(_run: PipelineRun): Promise<Partial<PipelineRun>> {
  throw new Error('thumbnail step not implemented — Phase 6에서 구현')
}
```

```typescript
// src/worker/steps/upload.ts
import type { PipelineRun } from '../../lib/types'
export async function runUpload(_run: PipelineRun): Promise<Partial<PipelineRun>> {
  throw new Error('upload step not implemented — Phase 7에서 구현')
}
```

- [ ] **Step 3: 컴파일 확인**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/worker/steps/
git commit -m "feat: 스텝 stub 7개 추가 (Phase 2~7에서 순서대로 구현)"
```

---

## Task 8: 오케스트레이터

**Files:**
- Create: `src/worker/orchestrator.ts`

- [ ] **Step 1: 오케스트레이터 작성**

```typescript
// src/worker/orchestrator.ts
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/index'
import { pipelineRuns } from '../db/schema'
import { STEPS, type PipelineRun, type StepName } from '../lib/types'
import { log } from './logger'
import { runScrape } from './steps/scrape'
import { runScript } from './steps/script'
import { runSrt } from './steps/srt'
import { runThumbnail } from './steps/thumbnail'
import { runTts } from './steps/tts'
import { runUpload } from './steps/upload'
import { runVideo } from './steps/video'

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}

async function runStep(step: StepName, run: PipelineRun): Promise<Partial<PipelineRun>> {
  switch (step) {
    case 'scrape':    return runScrape(run)
    case 'script':    return runScript(run)
    case 'tts':       return runTts(run)
    case 'srt':       return runSrt(run)
    case 'video':     return runVideo(run)
    case 'thumbnail': return runThumbnail(run)
    case 'upload':    return runUpload(run)
  }
}

async function main() {
  const today = getToday()
  log(`=== Silver Autopilot 시작 (${today}) ===`)

  let [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.date, today))

  if (run?.status === 'done') {
    log('이미 완료됨, 종료')
    return
  }

  if (!run) {
    ;[run] = await db
      .insert(pipelineRuns)
      .values({
        id: nanoid(),
        date: today,
        status: 'pending',
        current_step: 'scrape',
        created_at: now(),
        updated_at: now(),
      })
      .returning()
  }

  const startStep = (run.error_step ?? run.current_step ?? 'scrape') as StepName
  const startIndex = STEPS.indexOf(startStep)

  await db
    .update(pipelineRuns)
    .set({ status: 'running', updated_at: now() })
    .where(eq(pipelineRuns.id, run.id))

  for (const step of STEPS.slice(startIndex)) {
    await db
      .update(pipelineRuns)
      .set({ current_step: step, error_step: null, updated_at: now() })
      .where(eq(pipelineRuns.id, run.id))

    log(`[${step}] 시작`)

    try {
      const updates = await runStep(step, run as PipelineRun)
      await db
        .update(pipelineRuns)
        .set({ ...updates, updated_at: now() })
        .where(eq(pipelineRuns.id, run.id))
      log(`[${step}] 완료`)
    } catch (err) {
      const error = err as Error
      await db
        .update(pipelineRuns)
        .set({
          status: 'failed',
          error_step: step,
          error_message: error.message,
          error_stack: error.stack ?? null,
          updated_at: now(),
        })
        .where(eq(pipelineRuns.id, run.id))
      log(`[${step}] 실패: ${error.message}`)
      log(`[ERROR] ${error.stack ?? error.message}`)
      process.exit(1)
    }
  }

  await db
    .update(pipelineRuns)
    .set({ status: 'done', updated_at: now() })
    .where(eq(pipelineRuns.id, run.id))

  log('=== 파이프라인 완료 ===')
}

main().catch((err) => {
  console.error('치명적 오류:', err)
  process.exit(1)
})
```

- [ ] **Step 2: 컴파일 확인**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: smoke test — 실행 후 DB 상태 확인**

```bash
pnpm tsx src/worker/orchestrator.ts
```

Expected:
```
[2026-05-07 01:17:00] === Silver Autopilot 시작 (2026-05-07) ===
[2026-05-07 01:17:00] [scrape] 시작
[2026-05-07 01:17:00] [scrape] 실패: scrape step not implemented — Phase 2에서 구현
[2026-05-07 01:17:00] [ERROR] Error: scrape step not implemented ...
```

DB 상태 확인:
```bash
sqlite3 data/silver-autopilot.db "SELECT date, status, error_step, error_message FROM pipeline_runs;"
```

Expected:
```
2026-05-07|failed|scrape|scrape step not implemented — Phase 2에서 구현
```

로그 파일 생성 확인:
```bash
ls logs/
```

Expected:
```
2026-05-07.log  worker.log
```

- [ ] **Step 4: 커밋**

```bash
git add src/worker/orchestrator.ts
git commit -m "feat: 오케스트레이터 뼈대 구현 (스텝 순차 실행, 에러 시 DB 기록)"
```

---

## Task 9: status.ts + restart.ts

**Files:**
- Create: `src/worker/status.ts`
- Create: `src/worker/restart.ts`

- [ ] **Step 1: status.ts 작성**

```typescript
// src/worker/status.ts
import { desc } from 'drizzle-orm'
import { db } from '../db/index'
import { pipelineRuns } from '../db/schema'

const EMOJI: Record<string, string> = {
  pending: '⏳',
  running: '🔄',
  failed:  '❌',
  done:    '✅',
}

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const runs = await db
    .select()
    .from(pipelineRuns)
    .orderBy(desc(pipelineRuns.date))
    .limit(8)

  console.log('=== Silver Autopilot 상태 ===\n')

  const todayRun = runs.find((r) => r.date === today)
  if (!todayRun) {
    console.log(`오늘 (${today}): 실행 없음`)
  } else {
    const e = EMOJI[todayRun.status] ?? '?'
    console.log(`오늘 (${today}): ${e} ${todayRun.status.toUpperCase()}`)
    if (todayRun.status === 'failed') {
      console.log(`  실패 스텝  : ${todayRun.error_step}`)
      console.log(`  에러      : ${todayRun.error_message}`)
    }
    if (todayRun.status === 'running') {
      console.log(`  현재 스텝 : ${todayRun.current_step}`)
    }
  }

  const pastRuns = runs.filter((r) => r.date !== today)
  if (pastRuns.length > 0) {
    console.log('\n최근 실행 내역:')
    for (const run of pastRuns) {
      const e = EMOJI[run.status] ?? '?'
      const youtube = run.youtube_id ? `  https://youtu.be/${run.youtube_id}` : ''
      const error = run.error_step ? `  [${run.error_step}] ${run.error_message}` : ''
      console.log(`  ${run.date}  ${e} ${run.status.padEnd(8)}${youtube}${error}`)
    }
  }
}

main().catch(console.error)
```

- [ ] **Step 2: status.ts 동작 확인**

```bash
pnpm tsx src/worker/status.ts
```

Expected (Task 8 smoke test 이후):
```
=== Silver Autopilot 상태 ===

오늘 (2026-05-07): ❌ FAILED
  실패 스텝  : scrape
  에러      : scrape step not implemented — Phase 2에서 구현
```

- [ ] **Step 3: restart.ts 작성**

```typescript
// src/worker/restart.ts
import { eq } from 'drizzle-orm'
import { spawn } from 'child_process'
import { db } from '../db/index'
import { pipelineRuns } from '../db/schema'

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const [run] = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.date, today))

  if (!run) {
    console.log('오늘 실행 기록 없음')
    process.exit(1)
  }

  if (run.status === 'done') {
    console.log('이미 완료된 실행입니다')
    process.exit(0)
  }

  if (run.status !== 'failed') {
    console.log(`현재 상태: ${run.status} — 재시작 불필요`)
    process.exit(0)
  }

  console.log(`재시작: ${run.error_step} 스텝부터 이어서 실행`)

  await db
    .update(pipelineRuns)
    .set({ status: 'pending', updated_at: Math.floor(Date.now() / 1000) })
    .where(eq(pipelineRuns.id, run.id))

  const child = spawn('pnpm', ['tsx', 'src/worker/orchestrator.ts'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  })

  child.on('exit', (code) => process.exit(code ?? 0))
}

main().catch(console.error)
```

- [ ] **Step 4: restart.ts 동작 확인**

```bash
pnpm tsx src/worker/restart.ts
```

Expected:
```
재시작: scrape 스텝부터 이어서 실행
[2026-05-07 ...] === Silver Autopilot 시작 (2026-05-07) ===
[2026-05-07 ...] [scrape] 시작
[2026-05-07 ...] [scrape] 실패: scrape step not implemented ...
```

- [ ] **Step 5: 커밋**

```bash
git add src/worker/status.ts src/worker/restart.ts
git commit -m "feat: status.ts, restart.ts 추가"
```

---

## Task 10: package.json 스크립트 등록 + cron 설정

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 워커 스크립트 추가**

`package.json`의 `scripts` 섹션에 추가:

```json
"worker": "tsx src/worker/orchestrator.ts",
"worker:status": "tsx src/worker/status.ts",
"worker:restart": "tsx src/worker/restart.ts"
```

최종 scripts:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "worker": "tsx src/worker/orchestrator.ts",
  "worker:status": "tsx src/worker/status.ts",
  "worker:restart": "tsx src/worker/restart.ts"
}
```

- [ ] **Step 2: 스크립트 동작 확인**

```bash
pnpm worker:status
```

Expected: 상태 출력 정상 동작

- [ ] **Step 3: cron 등록**

```bash
crontab -e
```

아래 라인 추가:
```
17 1 * * * cd /Users/kyusikkim/projects/silver-autopilot && pnpm worker >> logs/worker.log 2>&1
```

cron 등록 확인:
```bash
crontab -l | grep silver
```

Expected:
```
17 1 * * * cd /Users/kyusikkim/projects/silver-autopilot && pnpm worker >> logs/worker.log 2>&1
```

- [ ] **Step 4: 전체 테스트 통과 확인**

```bash
pnpm test
```

Expected:
```
✓ tests/db/schema.test.ts (5)
Test Files  1 passed (1)
Tests  5 passed (5)
```

- [ ] **Step 5: 최종 커밋**

```bash
git add package.json
git commit -m "feat: 워커 npm 스크립트 등록 및 Phase 1 완료"
```

---

## Phase 1 완료 기준 체크리스트

- [ ] `pnpm test` — 5개 테스트 통과
- [ ] `pnpm worker` — scrape 스텝에서 failed 상태로 종료
- [ ] `pnpm worker:status` — 오늘 FAILED + error_step 출력
- [ ] `pnpm worker:restart` — failed → pending 리셋 후 재실행
- [ ] `logs/worker.log`, `logs/YYYY-MM-DD.log` 생성 확인
- [ ] `crontab -l` — 01:17 cron 등록 확인
- [ ] `sqlite3 data/silver-autopilot.db ".tables"` — pipeline_runs, scraped_posts 확인

---

## 다음 단계

Phase 2: 스크래퍼 — 네이트판/네이버카페/보배드림 인기 게시물 수집
스펙 파일: `docs/superpowers/specs/` (Phase 2 brainstorming 후 작성)
