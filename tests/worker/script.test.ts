import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/llm', () => ({
  callClaude: vi.fn(),
  extractJson: (s: string) => s,
}))

import { callClaude } from '../../src/lib/llm'
import { runScript } from '../../src/worker/steps/script'

const mockCallClaude = callClaude as ReturnType<typeof vi.fn>

const BASE_RUN = {
  id: 'run-1',
  date: '2026-05-07',
  status: 'running' as const,
  current_step: 'script' as const,
  error_step: null,
  error_message: null,
  error_stack: null,
  source_url: 'https://example.com/post/1',
  source_content: '테스트 원문입니다.',
  script: null,
  script_title: null,
  script_description: null,
  script_tags: null,
  image_prompt: null,
  audio_path: null,
  srt_path: null,
  background_path: null,
  video_path: null,
  thumbnail_path: null,
  youtube_id: null,
  created_at: 1000000,
  updated_at: 1000000,
}

const LONG_SCRIPT = 'a'.repeat(7500)
const SHORT_SCRIPT = 'a'.repeat(3000)
const META_JSON = JSON.stringify({
  title: '테스트 제목',
  description: '테스트 설명',
  tags: '태그1,태그2',
  image_prompt: 'a dramatic scene',
})

beforeEach(() => {
  mockCallClaude.mockReset()
})

describe('runScript', () => {
  it('source_content 없으면 throw', async () => {
    await expect(runScript({ ...BASE_RUN, source_content: null })).rejects.toThrow('source_content 없음')
  })

  it('7500자 이상이면 재시도 없이 바로 사용', async () => {
    mockCallClaude
      .mockResolvedValueOnce(LONG_SCRIPT)
      .mockResolvedValueOnce(META_JSON)
    const result = await runScript(BASE_RUN)
    expect(result.script).toBe(LONG_SCRIPT)
    expect(mockCallClaude).toHaveBeenCalledTimes(2)
  })

  it('짧으면 1회 재시도 후 긴 결과 반환', async () => {
    mockCallClaude
      .mockResolvedValueOnce(SHORT_SCRIPT)
      .mockResolvedValueOnce(LONG_SCRIPT)
      .mockResolvedValueOnce(META_JSON)
    const result = await runScript(BASE_RUN)
    expect(result.script).toBe(LONG_SCRIPT)
    expect(mockCallClaude).toHaveBeenCalledTimes(3)
  })

  it('3회 모두 짧으면 마지막 결과 그대로 반환', async () => {
    mockCallClaude
      .mockResolvedValueOnce(SHORT_SCRIPT)
      .mockResolvedValueOnce(SHORT_SCRIPT + 'b')
      .mockResolvedValueOnce(SHORT_SCRIPT + 'bc')
      .mockResolvedValueOnce(META_JSON)
    const result = await runScript(BASE_RUN)
    expect(result.script).toBe(SHORT_SCRIPT + 'bc')
  })

  it('재시도 메시지에 이전 스크립트가 포함됨', async () => {
    mockCallClaude
      .mockResolvedValueOnce(SHORT_SCRIPT)
      .mockResolvedValueOnce(LONG_SCRIPT)
      .mockResolvedValueOnce(META_JSON)
    await runScript(BASE_RUN)
    const retryCall = mockCallClaude.mock.calls[1]
    expect(retryCall[0].userMessage).toContain(SHORT_SCRIPT)
    expect(retryCall[0].userMessage).toContain('3000자')
  })

  it('메타데이터 JSON 파싱 성공 시 필드 반환', async () => {
    mockCallClaude
      .mockResolvedValueOnce(LONG_SCRIPT)
      .mockResolvedValueOnce(META_JSON)
    const result = await runScript(BASE_RUN)
    expect(result.script_title).toBe('테스트 제목')
    expect(result.script_description).toBe('테스트 설명')
    expect(result.script_tags).toBe('태그1,태그2')
    expect(result.image_prompt).toBe('a dramatic scene')
  })

  it('메타데이터 callClaude 실패 시 빈 문자열로 계속 진행', async () => {
    mockCallClaude
      .mockResolvedValueOnce(LONG_SCRIPT)
      .mockRejectedValueOnce(new Error('claude CLI timeout'))
    const result = await runScript(BASE_RUN)
    expect(result.script).toBe(LONG_SCRIPT)
    expect(result.script_title).toBe('')
    expect(result.script_description).toBe('')
  })

  it('메타데이터 JSON.parse 실패 시 빈 문자열로 계속 진행', async () => {
    mockCallClaude
      .mockResolvedValueOnce(LONG_SCRIPT)
      .mockResolvedValueOnce('INVALID_JSON_STRING')
    const result = await runScript(BASE_RUN)
    expect(result.script).toBe(LONG_SCRIPT)
    expect(result.script_title).toBe('')
    expect(result.script_description).toBe('')
  })
})
