import type { RawPost, SiteScraper } from '../types'

export const scrapeNate: SiteScraper = async (ctx) => {
  const page = await ctx.newPage()
  try {
    await page.goto('https://pann.nate.com/talk/ranking/total', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    const items = await page.$$eval('ul.post_wrap > li', (els) =>
      els.slice(0, 10).map((el, i) => {
        const a = el.querySelector('dt > h2 > a') as HTMLAnchorElement | null
        const href = a?.getAttribute('href') ?? ''
        const url = href.startsWith('http') ? href : `https://pann.nate.com${href}`
        const replyText = el.querySelector('span.reple-num')?.textContent ?? ''
        const rcmText = el.querySelector('dd.info span.rcm')?.textContent ?? ''
        return {
          url: a ? url : '',
          title: (a?.getAttribute('title') ?? a?.textContent ?? '').trim(),
          likes: parseInt(rcmText.replace(/[^0-9]/g, '') || '0', 10),
          comments: parseInt(replyText.replace(/[^0-9]/g, '') || '0', 10),
          rankInSite: i + 1,
        }
      }).filter(it => it.url)
    )

    const posts: RawPost[] = []
    for (const item of items) {
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const content = await page.$eval('#contentArea', el => el.textContent ?? '').catch(() => '')
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
