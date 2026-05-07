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
