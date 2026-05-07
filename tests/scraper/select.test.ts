import { describe, it, expect } from 'vitest'
import { selectBestPost } from '../../src/scraper/select'
import type { RawPost } from '../../src/scraper/types'

function post(source: string, rankInSite: number, contentLength: number, url: string): RawPost {
  return {
    source,
    url,
    title: `제목 ${url}`,
    content: 'A'.repeat(contentLength),
    likes: 100,
    comments: 10,
    rankInSite,
  }
}

describe('selectBestPost', () => {
  it('500자 미만 글을 필터링한다', () => {
    const posts = [
      post('nate', 1, 300, 'u1'), // 필터 제외
      post('nate', 2, 600, 'u2'), // 통과
    ]
    expect(selectBestPost(posts).url).toBe('u2')
  })

  it('모든 글이 500자 미만이면 에러를 던진다', () => {
    expect(() => selectBestPost([post('nate', 1, 100, 'u1')])).toThrow('수집된 글 없음')
  })

  it('빈 배열이면 에러를 던진다', () => {
    expect(() => selectBestPost([])).toThrow('수집된 글 없음')
  })

  it('total_score 최고점을 선택한다', () => {
    // u1: rank=1(10pt), char rank=1(10pt) = 20pt  → 동점, u1이 더 김
    // u2: rank=1(10pt), char rank=1(10pt) = 20pt
    const posts = [
      post('nate',  1, 2000, 'u1'), // rank=10, char=10 → 20
      post('bobae', 1,  800, 'u2'), // rank=10, char=10 → 20 (동점, 짧음)
    ]
    expect(selectBestPost(posts).url).toBe('u1')
  })

  it('동점 시 글자수 긴 것을 선택한다', () => {
    // u1: rank=1(10pt), char rank=2(9pt) = 19pt
    // u2: rank=2(9pt),  char rank=1(10pt) = 19pt  → 동점, u2가 더 김
    const posts = [
      post('nate', 1,  500, 'u1'),
      post('nate', 2, 1200, 'u2'),
    ]
    expect(selectBestPost(posts).url).toBe('u2')
  })

  it('사이트 실패(빈 결과)해도 다른 사이트 글로 선택한다', () => {
    const posts = [
      post('nate',  1, 100,  'u1'), // 필터 제외
      post('bobae', 1, 1000, 'u2'), // 통과
    ]
    expect(selectBestPost(posts).url).toBe('u2')
  })

  it('rank_score: 1위=10, 2위=9, 10위=1', () => {
    const posts = Array.from({ length: 10 }, (_, i) =>
      post('nate', i + 1, 1000 - i * 50, `u${i + 1}`)
    )
    // u1: rank=1(10pt), char rank=1(10pt) = 20 → 최고점
    expect(selectBestPost(posts).url).toBe('u1')
  })
})
