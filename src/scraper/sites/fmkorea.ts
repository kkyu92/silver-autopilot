import type { RawPost, SiteScraper } from '../types'

export const scrapeFmkorea: SiteScraper = async (ctx) => {
  const page = await ctx.newPage()
  try {
    await page.goto('https://www.fmkorea.com/best', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    const items = await page.$$eval('div.fm_best_widget ul li', (els) =>
      els.slice(0, 10).map((el, i) => {
        const h3 = el.querySelector('h3.title') as HTMLElement | null
        const a = el.querySelector('h3.title a') as HTMLAnchorElement | null
        const href = a?.getAttribute('href') ?? ''
        const url = href.startsWith('http') ? href : `https://www.fmkorea.com${href}`
        const recommText = el.querySelector('a.pc_voted_count span.count')?.textContent ?? ''
        const replyText = el.querySelector('span.comment_count')?.textContent ?? ''
        const title = h3?.getAttribute('data-original-title')
          ?? el.querySelector('span.ellipsis-target')?.textContent
          ?? ''
        return {
          url: a ? url : '',
          title: title.trim(),
          likes: parseInt(recommText.replace(/[^0-9]/g, '') || '0', 10),
          comments: parseInt(replyText.replace(/[^0-9]/g, '') || '0', 10),
          rankInSite: i + 1,
        }
      }).filter(it => it.url)
    )

    const posts: RawPost[] = []
    for (const item of items) {
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const content = await page.$eval('div.xe_content', el => el.textContent ?? '').catch(() => '')
        if (content.trim()) {
          posts.push({ source: 'fmkorea', ...item, content: content.trim() })
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
