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
