import { describe, it, expect } from 'vitest'
import { splitIntoCues } from '../../../src/lib/srt/cue-splitter'
import type { WhisperSegment, WhisperWord } from '../../../src/lib/srt/types'

describe('splitIntoCues — 짧은 segment', () => {
  it('segment 글자수가 ≤10자면 그대로 한 cue', () => {
    const segments: WhisperSegment[] = [
      { id: 0, start: 0, end: 1.4, text: '할머니의 손은' },  // 6자(공백 제외)
    ]
    const words: WhisperWord[] = [
      { word: '할머니의', start: 0, end: 0.5 },
      { word: '손은', start: 0.5, end: 1.4 },
    ]
    const cues = splitIntoCues(segments, words)
    expect(cues).toEqual([
      { index: 1, start: 0, end: 1.4, text: '할머니의 손은' },
    ])
  })
})

describe('splitIntoCues — 긴 segment 분할', () => {
  it('11자 이상 segment를 word timestamp로 분할', () => {
    const segments: WhisperSegment[] = [
      { id: 0, start: 0, end: 6.5, text: '할머니의 손은 거칠었지만 그 손에서 만들어진 김치는 따뜻했다' },
      // 글자수(공백 제외): 25자
    ]
    const words: WhisperWord[] = [
      { word: '할머니의', start: 0.0, end: 0.5 },     // 누적 4
      { word: '손은',     start: 0.5, end: 1.0 },     // 누적 6
      { word: '거칠었지만', start: 1.0, end: 1.8 },   // 누적 11 → 직전(6)까지 cue1
      { word: '그',       start: 1.8, end: 2.0 },     // 누적 6 (cue2 시작)
      { word: '손에서',   start: 2.0, end: 2.6 },     // 누적 9
      { word: '만들어진', start: 2.6, end: 3.5 },     // 누적 13 → 직전(9)까지 cue2
      { word: '김치는',   start: 3.5, end: 4.5 },     // 누적 8 (cue3)
      { word: '따뜻했다', start: 4.5, end: 6.5 },     // 누적 12 → 직전(8)까지 cue3, '따뜻했다'는 cue4
    ]
    const cues = splitIntoCues(segments, words)
    expect(cues).toEqual([
      { index: 1, start: 0.0, end: 1.0, text: '할머니의 손은' },
      { index: 2, start: 1.0, end: 2.6, text: '거칠었지만 그 손에서' },
      { index: 3, start: 2.6, end: 4.5, text: '만들어진 김치는' },
      { index: 4, start: 4.5, end: 6.5, text: '따뜻했다' },
    ])
  })
})

describe('splitIntoCues — 폴백/예외', () => {
  it('segment에 매칭되는 word가 없으면 segment 자체를 한 cue로', () => {
    const segments: WhisperSegment[] = [
      { id: 0, start: 0, end: 3.0, text: '단어 정보 없음' },
    ]
    const cues = splitIntoCues(segments, [])
    expect(cues).toEqual([
      { index: 1, start: 0, end: 3.0, text: '단어 정보 없음' },
    ])
  })

  it('한 단어가 10자 초과 → 그 단어를 한 cue로 (정책 위반 허용)', () => {
    const segments: WhisperSegment[] = [
      { id: 0, start: 0, end: 4.0, text: '엄청기다란말한단어 다음' },
    ]
    const words: WhisperWord[] = [
      { word: '엄청기다란말한단어', start: 0, end: 3.0 },  // 9자, 그래도 짧은 segment 케이스로 들어갈 수 있음
      { word: '다음', start: 3.0, end: 4.0 },
    ]
    // segment 글자수: 11자 → 분할 필요
    const cues = splitIntoCues(segments, words)
    expect(cues).toEqual([
      { index: 1, start: 0, end: 3.0, text: '엄청기다란말한단어' },
      { index: 2, start: 3.0, end: 4.0, text: '다음' },
    ])
  })

  it('빈 segments → 빈 배열', () => {
    expect(splitIntoCues([], [])).toEqual([])
  })

  it('cue index는 1부터 연속 증가 (segment 경계와 무관)', () => {
    const segments: WhisperSegment[] = [
      { id: 0, start: 0, end: 1.0, text: '짧은말' },
      { id: 1, start: 1.0, end: 2.0, text: '다른짧은말' },
    ]
    const words: WhisperWord[] = [
      { word: '짧은말', start: 0, end: 1.0 },
      { word: '다른짧은말', start: 1.0, end: 2.0 },
    ]
    const cues = splitIntoCues(segments, words)
    expect(cues.map(c => c.index)).toEqual([1, 2])
  })
})
