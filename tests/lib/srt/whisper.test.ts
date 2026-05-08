import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { transcribe } from '../../../src/lib/srt/whisper'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srt-whisper-test-'))
const tmpMp3 = path.join(tmpDir, 'test.mp3')

beforeEach(() => {
  fs.writeFileSync(tmpMp3, Buffer.from([0xff, 0xfb, 0x00, 0x00])) // dummy mp3 bytes
  vi.stubGlobal('fetch', vi.fn())
  process.env.GROQ_API_KEY = 'test-key'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.GROQ_API_KEY
})

describe('transcribe', () => {
  it('GROQ_API_KEY 미설정이면 throw', async () => {
    delete process.env.GROQ_API_KEY
    await expect(transcribe(tmpMp3)).rejects.toThrow(/GROQ_API_KEY/)
  })

  it('성공 응답 → WhisperResponse 파싱', async () => {
    const fakeResponse = {
      text: '할머니의 손은 거칠었다',
      segments: [{ id: 0, start: 0, end: 1.4, text: '할머니의 손은 거칠었다' }],
      words: [
        { word: '할머니의', start: 0, end: 0.5 },
        { word: '손은', start: 0.5, end: 0.9 },
        { word: '거칠었다', start: 0.9, end: 1.4 },
      ],
    }
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fakeResponse,
    } as unknown as Response)

    const result = await transcribe(tmpMp3)
    expect(result.segments).toHaveLength(1)
    expect(result.words).toHaveLength(3)
    expect(result.text).toBe('할머니의 손은 거칠었다')
  })

  it('HTTP 에러 → throw (status + body 메시지)', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as unknown as Response)

    await expect(transcribe(tmpMp3)).rejects.toThrow(/401.*Unauthorized/)
  })

  it('segments 비어있으면 throw', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: '', segments: [], words: [] }),
    } as unknown as Response)

    await expect(transcribe(tmpMp3)).rejects.toThrow(/음성 인식 결과 없음/)
  })

  it('Authorization 헤더에 Bearer 토큰 포함', async () => {
    const fakeResponse = {
      text: 'x',
      segments: [{ id: 0, start: 0, end: 1, text: 'x' }],
      words: [{ word: 'x', start: 0, end: 1 }],
    }
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fakeResponse,
    } as unknown as Response)

    await transcribe(tmpMp3)
    const calledWith = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const init = calledWith[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
  })
})
