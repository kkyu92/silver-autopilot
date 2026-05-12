import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

vi.mock('../../src/lib/tts/google', () => ({ googleTts: vi.fn() }))
vi.mock('../../src/lib/tts/elevenlabs', () => ({ elevenLabsTts: vi.fn() }))

import { googleTts } from '../../src/lib/tts/google'
import { elevenLabsTts } from '../../src/lib/tts/elevenlabs'
import { runTts } from '../../src/worker/steps/tts'
import type { PipelineRun } from '../../src/lib/types'

const mockGoogle = googleTts as ReturnType<typeof vi.fn>
const mockEleven = elevenLabsTts as ReturnType<typeof vi.fn>

const FIVE_PARA_SCRIPT = [
  '[문단1]\n훅 내용입니다.',
  '[문단2]\n배경 내용입니다.',
  '[문단3]\n전반부 내용입니다.',
  '[문단4]\n후반부 내용입니다.',
  '[문단5]\n결말 내용입니다.',
].join('\n\n')

const BASE_RUN: PipelineRun = {
  id: 'run-test-1',
  date: '2026-05-08',
  status: 'running',
  current_step: 'tts',
  error_step: null,
  error_message: null,
  error_stack: null,
  source_url: 'https://example.com',
  source_content: '원문',
  script: FIVE_PARA_SCRIPT,
  script_title: '제목',
  script_description: '설명',
  script_tags: '태그',
  image_prompt: 'prompt',
  audio_path: null,
  srt_path: null,
  background_path: null,
  video_path: null,
  thumbnail_path: null,
  youtube_id: null,
  created_at: 1000000,
  updated_at: 1000000,
}

beforeEach(() => {
  mockGoogle.mockReset()
  mockEleven.mockReset()
  process.env.TTS_PROVIDER = 'google'
})

afterEach(() => {
  const outDir = path.join(process.cwd(), 'output', 'audio')
  const testFile = path.join(outDir, `${BASE_RUN.id}.mp3`)
  if (fs.existsSync(testFile)) fs.unlinkSync(testFile)
})

describe('runTts', () => {
  it('script 없으면 throw', async () => {
    await expect(runTts({ ...BASE_RUN, script: null })).rejects.toThrow('script 없음')
  })

  it('[문단N] 마커 없으면 throw', async () => {
    await expect(runTts({ ...BASE_RUN, script: '마커 없는 스크립트' })).rejects.toThrow(
      '스크립트에 [문단N] 마커가 없습니다',
    )
  })

  it('TTS_PROVIDER 미설정 또는 기본값이면 googleTts 호출', async () => {
    delete process.env.TTS_PROVIDER
    mockGoogle.mockResolvedValue(Buffer.from('mp3chunk'))
    const result = await runTts(BASE_RUN)
    expect(mockGoogle).toHaveBeenCalledTimes(5)
    expect(mockEleven).not.toHaveBeenCalled()
    expect(result.audio_path).toContain('run-test-1.mp3')
  })

  it('TTS_PROVIDER=google 면 googleTts 호출', async () => {
    process.env.TTS_PROVIDER = 'google'
    mockGoogle.mockResolvedValue(Buffer.from('mp3chunk'))
    const result = await runTts(BASE_RUN)
    expect(mockGoogle).toHaveBeenCalledTimes(5)
    expect(mockEleven).not.toHaveBeenCalled()
    expect(result.audio_path).toContain('run-test-1.mp3')
  })

  it('TTS_PROVIDER=elevenlabs 면 elevenLabsTts 호출', async () => {
    process.env.TTS_PROVIDER = 'elevenlabs'
    mockEleven.mockResolvedValue(Buffer.from('mp3chunk'))
    const result = await runTts(BASE_RUN)
    expect(mockEleven).toHaveBeenCalledTimes(5)
    expect(mockGoogle).not.toHaveBeenCalled()
    expect(result.audio_path).toContain('run-test-1.mp3')
  })

  it('5개 청크가 concat돼서 파일 저장됨', async () => {
    mockGoogle.mockResolvedValue(Buffer.from('AB'))
    const result = await runTts(BASE_RUN)
    const saved = fs.readFileSync(result.audio_path!)
    expect(saved.length).toBe(10) // 5 × 2 bytes
    expect(saved.toString()).toBe('ABABABABAB')
  })

  it('문단 API 실패 시 1회 재시도 후 성공', async () => {
    mockGoogle
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue(Buffer.from('ok'))
    const result = await runTts(BASE_RUN)
    expect(mockGoogle).toHaveBeenCalledTimes(6) // 1실패+1재시도 + 나머지4
    expect(result.audio_path).toBeTruthy()
  })

  it('문단 API 2회 모두 실패 시 throw', async () => {
    mockGoogle
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
    await expect(runTts(BASE_RUN)).rejects.toThrow('fail2')
  })
})
