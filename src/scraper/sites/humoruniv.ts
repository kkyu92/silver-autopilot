import type { RawPost, SiteScraper } from '../types'

export const scrapeHumoruniv: SiteScraper = async (ctx) => {
  const page = await ctx.newPage()
  try {
    await page.goto('https://web.humoruniv.com/board/humor/list.html?table=pds', {
      waitUntil: 'networkidle',
      timeout: 30000,
    })

    const items = await page.$$eval('tr[id^="li_chk_pds-"]', (els) =>
      els.slice(0, 10).map((el, i) => {
        const a = el.querySelector('td.li_sbj a.li') as HTMLAnchorElement | null
        const href = a?.getAttribute('href') ?? ''
        const url = href.startsWith('http') ? href : `https://web.humoruniv.com/board/humor/${href}`
        const titleSpan = el.querySelector('span[id^="title_chk_pds-"]')
        const title = (titleSpan?.textContent ?? a?.textContent ?? '').trim()
        const replyText = el.querySelector('span.list_comment_num')?.textContent ?? ''
        const undNums = Array.from(el.querySelectorAll('td.li_und')).map(t =>
          parseInt((t.textContent ?? '0').replace(/[^0-9]/g, '') || '0', 10)
        )
        // li_und 순서: 조회 / 추천 / 비추 (첫 게시글 detail에서 검증: 추천 54, 반대 1, 조회 2090)
        return {
          url: a ? url : '',
          title,
          likes: undNums[1] ?? 0,
          comments: parseInt(replyText.replace(/[^0-9]/g, '') || '0', 10),
          rankInSite: i + 1,
        }
      }).filter(it => it.url)
    )

    const posts: RawPost[] = []
    for (const item of items) {
      try {
        await page.goto(item.url, { waitUntil: 'networkidle', timeout: 30000 })
        // humoruniv는 본문이 readexp.html iframe에 부모 JS로 주입되는 구조.
        const content = await page.evaluate(() => {
          const iframes = document.querySelectorAll('iframe')
          for (const f of iframes) {
            try {
              if (f.src.includes('readexp') && f.contentDocument?.body) {
                return f.contentDocument.body.textContent ?? ''
              }
            } catch {
              // cross-origin iframe — 스킵
            }
          }
          return ''
        })
        if (content.trim()) {
          posts.push({ source: 'humoruniv', ...item, content: content.trim() })
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
