export interface TtsOptions {
  voice?: string
  speed?: number
}

const NAVER_MAX_BYTES = 4800

export function splitScript(script: string): string[] {
  const markerRegex = /\[문단\d+\]/g
  if (!markerRegex.test(script)) throw new Error('스크립트에 [문단N] 마커가 없습니다')

  const parts = script.split(/\[문단\d+\]/).map(s => s.trim()).filter(Boolean)
  if (parts.length === 0) throw new Error('스크립트에 [문단N] 마커가 없습니다')

  for (const part of parts) {
    if (Buffer.byteLength(part, 'utf8') > NAVER_MAX_BYTES) {
      console.warn(`[tts] 문단이 ${Buffer.byteLength(part, 'utf8')} bytes로 한도 초과 — 추가 분할 필요`)
    }
  }
  return parts
}
