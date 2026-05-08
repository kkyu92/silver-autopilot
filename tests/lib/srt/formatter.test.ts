import { describe, it, expect } from 'vitest'
import { formatSrt, formatTime } from '../../../src/lib/srt/formatter'
import type { SrtCue } from '../../../src/lib/srt/types'

describe('formatTime', () => {
  it('0초 → 00:00:00,000', () => {
    expect(formatTime(0)).toBe('00:00:00,000')
  })

  it('1.234초 → 00:00:01,234', () => {
    expect(formatTime(1.234)).toBe('00:00:01,234')
  })

  it('정수 초 → 밀리초는 000', () => {
    expect(formatTime(5)).toBe('00:00:05,000')
  })

  it('1분 30.5초 → 00:01:30,500', () => {
    expect(formatTime(90.5)).toBe('00:01:30,500')
  })

  it('1시간 넘는 케이스 → 01:23:45,678', () => {
    expect(formatTime(3600 + 23 * 60 + 45.678)).toBe('01:23:45,678')
  })
})

describe('formatSrt', () => {
  it('단일 cue를 SRT 포맷으로 변환', () => {
    const cues: SrtCue[] = [
      { index: 1, start: 0, end: 1.0, text: '할머니의 손은' },
    ]
    expect(formatSrt(cues)).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\n할머니의 손은\n\n',
    )
  })

  it('여러 cue를 빈 줄 1개로 구분', () => {
    const cues: SrtCue[] = [
      { index: 1, start: 0, end: 1.0, text: '할머니의 손은' },
      { index: 2, start: 1.0, end: 1.8, text: '거칠었지만' },
    ]
    const out = formatSrt(cues)
    expect(out).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\n할머니의 손은\n\n' +
      '2\n00:00:01,000 --> 00:00:01,800\n거칠었지만\n\n',
    )
  })

  it('빈 배열 → 빈 문자열', () => {
    expect(formatSrt([])).toBe('')
  })
})
