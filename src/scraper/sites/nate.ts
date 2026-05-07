import type { Browser } from 'playwright'
import type { RawPost, SiteScraper } from '../types'

export const scrapeNate: SiteScraper = async (browser) => {
  const page = await browser.newPage()
  try {
    await page.goto('https://nate.com/talk/bestList.do?type=allBest', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    const items = await page.$$eval('ul.list_type2 li, ul.normalList li', (els) =>
      els.slice(0, 10).map((el, i) => {
        const a = el.querySelector('strong.tit a, a.tit') as HTMLAnchorElement | null
        const likesEl = el.querySelector('span.emHit, em.u_cnt._recomBtn')
        const commentsEl = el.querySelector('span.emReply, em.u_cnt._replyBtn')
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
          'div.artCont, div.articleContent, div#article_body',
          el => el.textContent ?? ''
        ).catch(() => '')
        if (content.trim()) {
          posts.push({ source: 'nate', ...item, content: content.trim() })
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
