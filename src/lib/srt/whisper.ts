import * as fs from 'node:fs'
import type { WhisperResponse } from './types'

const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions'

export async function transcribe(audioPath: string): Promise<WhisperResponse> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY 환경변수 필요')

  const model = process.env.GROQ_WHISPER_MODEL ?? 'whisper-large-v3-turbo'

  const audio = fs.readFileSync(audioPath)
  const blob = new Blob([audio], { type: 'audio/mpeg' })

  const form = new FormData()
  form.append('file', blob, 'audio.mp3')
  form.append('model', model)
  form.append('language', 'ko')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  form.append('timestamp_granularities[]', 'segment')

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Groq Whisper HTTP ${res.status}: ${body}`)
  }

  const data = (await res.json()) as WhisperResponse
  if (!data.segments || data.segments.length === 0) {
    throw new Error('음성 인식 결과 없음 (segments 비어있음)')
  }
  return data
}
