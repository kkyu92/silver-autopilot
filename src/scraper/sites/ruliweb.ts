import type { BrowserContext } from 'playwright'
import type { RawPost, SiteScraper } from '../types'

export const scrapeRuliweb: SiteScraper = async (ctx) => {
  const page = await ctx.newPage()
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
      }).filter(it => it.url)
    )

    const posts: RawPost[] = []
    for (const item of items) {
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const content = await page.$eval(
          'div.view_content, div.board_main_text',
          el => el.textContent ?? ''
        ).catch(() => '')
        if (content.trim()) {
          posts.push({ source: 'ruliweb', ...item, content: content.trim() })
        }
        await page.waitForTimeout(1000 + Math.floor(Math.random() * 1000))
      } catch {
        // 개별 게시글 실패 시 스킵
      }
    }
    return posts
  } finally {
    await page.close()
  }
}
