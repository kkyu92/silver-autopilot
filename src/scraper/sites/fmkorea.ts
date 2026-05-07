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
