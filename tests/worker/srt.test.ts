import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

vi.mock('../../src/lib/srt/whisper', () => ({ transcribe: vi.fn() }))

import { transcribe } from '../../src/lib/srt/whisper'
import { runSrt } from '../../src/worker/steps/srt'
import type { PipelineRun } from '../../src/lib/types'

const mockTranscribe = transcribe as ReturnType<typeof vi.fn>

const BASE_RUN: PipelineRun = {
  id: 'run-srt-1',
  date: '2026-05-08',
  status: 'running',
  current_step: 'srt',
  error_step: null,
  error_message: null,
  error_stack: null,
  source_url: null,
  source_content: null,
  script: null,
  script_title: null,
  script_description: null,
  script_tags: null,
  image_prompt: null,
  audio_path: '/tmp/run-srt-1.mp3',
  srt_path: null,
  background_path: null,
  video_path: null,
  thumbnail_path: null,
  youtube_id: null,
  created_at: 1000000,
  updated_at: 1000000,
}

beforeEach(() => {
  mockTranscribe.mockReset()
})

afterEach(() => {
  const outFile = path.join(process.cwd(), 'output', 'srt', `${BASE_RUN.id}.srt`)
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile)
})

describe('runSrt', () => {
  it('audio_path 없으면 throw', async () => {
    await expect(runSrt({ ...BASE_RUN, audio_path: null })).rejects.toThrow('audio_path 없음')
  })

  it('정상 흐름: transcribe → SRT 파일 생성 → srt_path 반환', async () => {
    mockTranscribe.mockResolvedValue({
      text: '짧은말',
      segments: [{ id: 0, start: 0, end: 1.0, text: '짧은말' }],
      words: [{ word: '짧은말', start: 0, end: 1.0 }],
    })

    const result = await runSrt(BASE_RUN)

    expect(result.srt_path).toContain('run-srt-1.srt')
    expect(fs.existsSync(result.srt_path!)).toBe(true)

    const content = fs.readFileSync(result.srt_path!, 'utf8')
    expect(content).toContain('00:00:00,000 --> 00:00:01,000')
    expect(content).toContain('짧은말')
  })

  it('transcribe 1차 실패 시 1회 재시도 후 성공', async () => {
    mockTranscribe
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue({
        text: 'x',
        segments: [{ id: 0, start: 0, end: 1, text: 'x' }],
        words: [{ word: 'x', start: 0, end: 1 }],
      })

    const result = await runSrt(BASE_RUN)
    expect(mockTranscribe).toHaveBeenCalledTimes(2)
    expect(result.srt_path).toBeTruthy()
  })

  it('transcribe 2회 모두 실패 시 throw', async () => {
    mockTranscribe
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))

    await expect(runSrt(BASE_RUN)).rejects.toThrow('fail2')
    expect(mockTranscribe).toHaveBeenCalledTimes(2)
  })
})
