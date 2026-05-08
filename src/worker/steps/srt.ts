import * as fs from 'node:fs'
import * as path from 'node:path'
import { transcribe } from '../../lib/srt/whisper'
import { splitIntoCues } from '../../lib/srt/cue-splitter'
import { formatSrt } from '../../lib/srt/formatter'
import type { PipelineRun } from '../../lib/types'
import { log } from '../logger'

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    log(`[srt] 1차 실패, 재시도: ${(err as Error).message}`)
    return fn()
  }
}

export async function runSrt(run: PipelineRun): Promise<Partial<PipelineRun>> {
  if (!run.audio_path) throw new Error('audio_path 없음')
  const audioPath = run.audio_path

  log(`[srt] Whisper 호출: ${audioPath}`)
  const whisper = await callWithRetry(() => transcribe(audioPath))

  const cues = splitIntoCues(whisper.segments, whisper.words)
  log(`[srt] cue 생성: ${cues.length}개`)

  const srt = formatSrt(cues)

  const outDir = path.join(process.cwd(), 'output', 'srt')
  fs.mkdirSync(outDir, { recursive: true })
  const srtPath = path.join(outDir, `${run.id}.srt`)
  fs.writeFileSync(srtPath, srt, 'utf8')

  log(`[srt] 저장 완료: ${srtPath} (${cues.length} cues)`)
  return { srt_path: srtPath }
}
