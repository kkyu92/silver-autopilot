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

  const allUrls = allPosts.map(p => p.url).filter(Boolean)
  const existingSet = new Set<string>()
  if (allUrls.length > 0) {
    const existing = await db
      .select({ url: scrapedPosts.original_url })
      .from(scrapedPosts)
      .where(inArray(scrapedPosts.original_url, allUrls))
    for (const r of existing) existingSet.add(r.url)
  }

  const newPosts = allPosts.filter(p => p.url && !existingSet.has(p.url))

  const selected = selectBestPost(newPosts)

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
