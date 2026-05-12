import type { RawPost, SiteScraper } from '../types'

export const scrapeCook82: SiteScraper = async (ctx) => {
  const page = await ctx.newPage()
  try {
    await page.goto('https://www.82cook.com/entiz/enti.php?bn=15', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    const items = await page.$$eval('table tr:not(.noticeList)', (els) =>
      els
        .filter(tr => tr.querySelector('td.title a'))
        .slice(0, 10)
        .map((tr, i) => {
          const a = tr.querySelector('td.title a') as HTMLAnchorElement | null
          const href = a?.getAttribute('href') ?? ''
          const url = href.startsWith('http') ? href : `https://www.82cook.com/entiz/${href}`
          return {
            url: a ? url : '',
            title: (a?.textContent ?? '').trim(),
            likes: 0,
            comments: 0,
            rankInSite: i + 1,
          }
        })
        .filter(it => it.url)
    )

    const posts: RawPost[] = []
    for (const item of items) {
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const content = await page.$eval('#articleBody', el => el.textContent ?? '').catch(() => '')
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
