import type { SrtCue } from './types'

export function formatTime(seconds: number): string {
  const totalMs = Math.round(seconds * 1000)
  const ms = totalMs % 1000
  const totalSec = Math.floor(totalMs / 1000)
  const s = totalSec % 60
  const totalMin = Math.floor(totalSec / 60)
  const m = totalMin % 60
  const h = Math.floor(totalMin / 60)
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const pad3 = (n: number) => String(n).padStart(3, '0')
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`
}

export function formatSrt(cues: SrtCue[]): string {
  return cues
    .map(c => `${c.index}\n${formatTime(c.start)} --> ${formatTime(c.end)}\n${c.text}\n\n`)
    .join('')
}
