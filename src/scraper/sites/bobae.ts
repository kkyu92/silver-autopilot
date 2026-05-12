import type { RawPost, SiteScraper } from '../types'

export const scrapeBobae: SiteScraper = async (ctx) => {
  const page = await ctx.newPage()
  try {
    await page.goto('https://www.bobaedream.co.kr/list?code=best', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    const items = await page.$$eval('table tr[itemtype*="schema.org/Article"]', (els) =>
      els.slice(0, 10).map((el, i) => {
        const a = el.querySelector('a.bsubject') as HTMLAnchorElement | null
        const href = a?.getAttribute('href') ?? ''
        const url = href.startsWith('http') ? href : `https://www.bobaedream.co.kr${href}`
        const recommText = el.querySelector('td.recomm')?.textContent ?? ''
        const replyText = el.querySelector('strong.totreply')?.textContent ?? ''
        return {
          url: a ? url : '',
          title: (a?.textContent ?? '').trim(),
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
        const content = await page.$eval('div.bodyCont', el => el.textContent ?? '').catch(() => '')
        if (content.trim()) {
          posts.push({ source: 'bobae', ...item, content: content.trim() })
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
