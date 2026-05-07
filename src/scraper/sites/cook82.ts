import type { BrowserContext } from 'playwright'
import type { RawPost, SiteScraper } from '../types'

export const scrapeCook82: SiteScraper = async (ctx) => {
  const page = await ctx.newPage()
  try {
    await page.goto('https://www.82cook.com/entiz/list.php?bn=15', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    const items = await page.$$eval('table.list_table tbody tr, ul.list_ul li', (els) =>
      els.slice(0, 10).map((el, i) => {
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
      }).filter(it => it.url)
    )

    const posts: RawPost[] = []
    for (const item of items) {
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const content = await page.$eval(
          'div.cnt_area, div#post_content, div.read_body',
          el => el.textContent ?? ''
        ).catch(() => '')
        if (content.trim()) {
          posts.push({ source: 'cook82', ...item, content: content.trim() })
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
