import type { TtsOptions } from './types'

export async function naverTts(text: string, opts: TtsOptions = {}): Promise<Buffer> {
  const clientId = process.env.NAVER_TTS_CLIENT_ID
  const clientSecret = process.env.NAVER_TTS_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('NAVER_TTS_CLIENT_ID / NAVER_TTS_CLIENT_SECRET 환경변수 필요')

  if (!text.trim()) throw new Error('Naver TTS: text가 비어있습니다')

  const byteLen = Buffer.byteLength(text, 'utf8')
  if (byteLen > 4800) throw new Error(`Naver TTS: 텍스트가 ${byteLen} bytes로 API 한도(4800) 초과`)

  const voice = opts.voice ?? process.env.NAVER_TTS_VOICE ?? 'ntaesan'
  const speed = opts.speed ?? 0

  const body = new URLSearchParams({
    speaker: voice,
    speed: String(speed),
    text,
  })

  const res = await fetch('https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts', {
    method: 'POST',
    headers: {
      'X-NCP-APIGW-API-KEY-ID': clientId,
      'X-NCP-APIGW-API-KEY': clientSecret,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText)
    throw new Error(`Naver TTS HTTP ${res.status}: ${msg}`)
  }

  return Buffer.from(await res.arrayBuffer())
}
