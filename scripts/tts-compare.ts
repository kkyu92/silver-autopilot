import * as fs from 'node:fs'
import * as path from 'node:path'
import Database from 'better-sqlite3'
import { naverTts } from '../src/lib/tts/naver'
import { googleTts } from '../src/lib/tts/google'
import { elevenLabsTts } from '../src/lib/tts/elevenlabs'
import { splitScript } from '../src/lib/tts/types'

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'silver.db')

function getLatestScript(): { id: string; script: string } {
  const db = new Database(DB_PATH, { readonly: true })
  const row = db
    .prepare(
      `SELECT id, script FROM pipeline_runs
       WHERE script IS NOT NULL AND status = 'done'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get() as { id: string; script: string } | undefined
  db.close()
  if (!row) throw new Error('완료된 pipeline_run이 없습니다')
  return row
}

async function runProvider(
  name: string,
  fn: (text: string) => Promise<Buffer>,
  paragraphs: string[],
  runId: string,
): Promise<void> {
  const outDir = path.join(process.cwd(), 'output', 'compare')
  fs.mkdirSync(outDir, { recursive: true })

  const chunks: Buffer[] = []
  for (const para of paragraphs) {
    chunks.push(await fn(para))
  }
  const mp3 = Buffer.concat(chunks)
  const outPath = path.join(outDir, `${runId}-${name}.mp3`)
  fs.writeFileSync(outPath, mp3)
  console.log(`✅ ${name}: ${outPath} (${(mp3.length / 1024 / 1024).toFixed(2)}MB)`)
}

async function main() {
  const { id, script } = getLatestScript()
  console.log(`\n비교 실행: run_id=${id}\n`)

  const paragraphs = splitScript(script)

  const results = await Promise.allSettled([
    runProvider('naver', naverTts, paragraphs, id),
    runProvider('google', googleTts, paragraphs, id),
    runProvider('elevenlabs', elevenLabsTts, paragraphs, id),
  ])

  const providers = ['naver', 'google', 'elevenlabs']
  console.log('\n--- 결과 요약 ---')
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.log(`❌ ${providers[i]}: ${(r.reason as Error).message}`)
    }
  })
}

main().catch(err => {
  console.error('치명적 오류:', err)
  process.exit(1)
})
