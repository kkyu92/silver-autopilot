import type { RawPost } from './types'

const MIN_CHARS = 500

export function selectBestPost(posts: RawPost[]): RawPost {
  const filtered = posts.filter(p => p.content.length >= MIN_CHARS)

  if (filtered.length === 0) {
    throw new Error('수집된 글 없음 — 모든 사이트 실패 또는 500자 미만')
  }

  // 사이트별 글자수 순위 계산을 위해 그룹화
  const bySite = new Map<string, RawPost[]>()
  for (const p of filtered) {
    if (!bySite.has(p.source)) bySite.set(p.source, [])
    bySite.get(p.source)!.push(p)
  }
  for (const sitePosts of bySite.values()) {
    sitePosts.sort((a, b) => b.content.length - a.content.length)
  }

  const scored = filtered.map(p => {
    const rankScore = Math.max(1, 11 - p.rankInSite)
    const sitePosts = bySite.get(p.source)!
    const charRank = sitePosts.findIndex(sp => sp.url === p.url) + 1
    const charScore = Math.max(1, 11 - charRank)
    return { post: p, totalScore: rankScore + charScore }
  })

  scored.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
    return b.post.content.length - a.post.content.length
  })

  return scored[0].post
}
