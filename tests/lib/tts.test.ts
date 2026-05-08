import { describe, it, expect } from 'vitest'
import { splitScript } from '../../src/lib/tts/types'

const MARKER_SCRIPT = `[문단1]
첫 번째 문단 내용입니다.

[문단2]
두 번째 문단 내용입니다.

[문단3]
세 번째 문단 내용입니다.

[문단4]
네 번째 문단 내용입니다.

[문단5]
다섯 번째 문단 내용입니다.`

describe('splitScript', () => {
  it('5개 마커가 있으면 5개 배열 반환', () => {
    const parts = splitScript(MARKER_SCRIPT)
    expect(parts).toHaveLength(5)
  })

  it('마커 텍스트는 제거되고 내용만 반환', () => {
    const parts = splitScript(MARKER_SCRIPT)
    expect(parts[0]).toBe('첫 번째 문단 내용입니다.')
    expect(parts[4]).toBe('다섯 번째 문단 내용입니다.')
    parts.forEach(p => expect(p).not.toMatch(/\[문단\d+\]/))
  })

  it('마커 없으면 throw', () => {
    expect(() => splitScript('마커 없는 스크립트입니다.')).toThrow('스크립트에 [문단N] 마커가 없습니다')
  })

  it('빈 문자열이면 throw', () => {
    expect(() => splitScript('')).toThrow('스크립트에 [문단N] 마커가 없습니다')
  })

  it('각 문단 앞뒤 공백 제거', () => {
    const script = '[문단1]\n  앞뒤 공백  \n[문단2]\n내용'
    const parts = splitScript(script)
    expect(parts[0]).toBe('앞뒤 공백')
  })
})
