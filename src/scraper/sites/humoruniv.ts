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
