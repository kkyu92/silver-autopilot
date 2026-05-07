import type { Browser } from 'playwright'

export interface RawPost {
  source: string
  url: string
  title: string
  content: string
  likes: number
  comments: number
  rankInSite: number // 1-based, 베스트 게시판 내 순위
}

export type SiteScraper = (browser: Browser) => Promise<RawPost[]>
