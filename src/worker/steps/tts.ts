import * as fs from 'node:fs'
import * as path from 'node:path'
import { googleTts } from '../../lib/tts/google'
import { elevenLabsTts } from '../../lib/tts/elevenlabs'
import { splitScript } from '../../lib/tts/types'
import type { PipelineRun } from '../../lib/types'
import { log } from '../logger'

type Provider = (text: string) => Promise<Buffer>

function getProvider(): Provider {
  const name = process.env.TTS_PROVIDER ?? 'google'
  if (name === 'elevenlabs') return elevenLabsTts
  return googleTts
}

async function callWithRetry(provider: Provider, text: string, index: number): Promise<Buffer> {
  try {
    return await provider(text)
  } catch (err) {
    log(`[tts] 문단${index + 1} 1차 실패, 재시도: ${(err as Error).message}`)
    return provider(text)
  }
}

export async function runTts(run: PipelineRun): Promise<Partial<PipelineRun>> {
  if (!run.script) throw new Error('script 없음')

  const paragraphs = splitScript(run.script)
  const provider = getProvider()

  const chunks: Buffer[] = []
  for (let i = 0; i < paragraphs.length; i++) {
    log(`[tts] 문단${i + 1}/${paragraphs.length} 변환 중`)
    const chunk = await callWithRetry(provider, paragraphs[i], i)
    chunks.push(chunk)
  }

  const mp3 = Buffer.concat(chunks)

  const outDir = path.join(process.cwd(), 'output', 'audio')
  fs.mkdirSync(outDir, { recursive: true })

  const audioPath = path.join(outDir, `${run.id}.mp3`)
  fs.writeFileSync(audioPath, mp3)

  log(`[tts] 저장 완료: ${audioPath} (${(mp3.length / 1024).toFixed(1)} KB)`)
  return { audio_path: audioPath }
}
