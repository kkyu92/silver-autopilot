import type { TtsOptions } from './types'

export async function googleTts(text: string, opts: TtsOptions = {}): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY
  if (!apiKey) throw new Error('GOOGLE_TTS_API_KEY 환경변수 필요')

  if (!text.trim()) throw new Error('Google TTS: text가 비어있습니다')

  const voiceName = opts.voice ?? process.env.GOOGLE_TTS_VOICE ?? 'ko-KR-Neural2-C'

  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'ko-KR', name: voiceName },
        audioConfig: { audioEncoding: 'MP3', speakingRate: opts.speed ?? 1.0 },
      }),
    },
  )

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText)
    throw new Error(`Google TTS HTTP ${res.status}: ${msg}`)
  }

  const json = (await res.json()) as { audioContent?: string; error?: { message: string } }

  if (json.error) throw new Error(`Google TTS error: ${json.error.message}`)
  if (!json.audioContent) throw new Error('Google TTS: audioContent 없음')

  return Buffer.from(json.audioContent, 'base64')
}
