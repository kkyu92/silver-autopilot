import { desc } from 'drizzle-orm'
import { db } from '../db/index'
import { pipelineRuns } from '../db/schema'

const EMOJI: Record<string, string> = {
  pending: '⏳',
  running: '🔄',
  failed:  '❌',
  done:    '✅',
}

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const runs = await db
    .select()
    .from(pipelineRuns)
    .orderBy(desc(pipelineRuns.date))
    .limit(8)

  console.log('=== Silver Autopilot 상태 ===\n')

  const todayRun = runs.find((r) => r.date === today)
  if (!todayRun) {
    console.log(`오늘 (${today}): 실행 없음`)
  } else {
    const e = EMOJI[todayRun.status] ?? '?'
    console.log(`오늘 (${today}): ${e} ${todayRun.status.toUpperCase()}`)
    if (todayRun.status === 'failed') {
      console.log(`  실패 스텝  : ${todayRun.error_step}`)
      console.log(`  에러      : ${todayRun.error_message}`)
    }
    if (todayRun.status === 'running') {
      console.log(`  현재 스텝 : ${todayRun.current_step}`)
    }
  }

  const pastRuns = runs.filter((r) => r.date !== today)
  if (pastRuns.length > 0) {
    console.log('\n최근 실행 내역:')
    for (const run of pastRuns) {
      const e = EMOJI[run.status] ?? '?'
      const youtube = run.youtube_id ? `  https://youtu.be/${run.youtube_id}` : ''
      const error = run.error_step ? `  [${run.error_step}] ${run.error_message}` : ''
      console.log(`  ${run.date}  ${e} ${run.status.padEnd(8)}${youtube}${error}`)
    }
  }
}

main().catch(console.error)
