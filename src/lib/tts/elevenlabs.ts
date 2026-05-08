import type { TtsOptions } from './types'

export async function elevenLabsTts(text: string, opts: TtsOptions = {}): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY 환경변수 필요')

  if (!text.trim()) throw new Error('ElevenLabs TTS: text가 비어있습니다')

  const voiceId = opts.voice ?? process.env.ELEVENLABS_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB'

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText)
    throw new Error(`ElevenLabs HTTP ${res.status}: ${msg}`)
  }

  return Buffer.from(await res.arrayBuffer())
}
