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
        error_message: 'TTS API timeout',
        error_stack: 'Error: timeout\n  at runTts:34',
        updated_at: now,
      })
      .where(eq(pipelineRuns.id, run.id))

    const [updated] = await db.select().from(pipelineRuns)
      .where(eq(pipelineRuns.id, run.id))

    expect(updated.status).toBe('failed')
    expect(updated.error_step).toBe('tts')
    expect(updated.error_message).toBe('TTS API timeout')
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
