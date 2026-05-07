import { eq } from 'drizzle-orm'
import { spawn } from 'child_process'
import { db } from '../db/index'
import { pipelineRuns } from '../db/schema'

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const [run] = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.date, today))

  if (!run) {
    console.log('오늘 실행 기록 없음')
    process.exit(1)
  }

  if (run.status === 'done') {
    console.log('이미 완료된 실행입니다')
    process.exit(0)
  }

  if (run.status !== 'failed') {
    console.log(`현재 상태: ${run.status} — 재시작 불필요`)
    process.exit(0)
  }

  console.log(`재시작: ${run.error_step} 스텝부터 이어서 실행`)

  await db
    .update(pipelineRuns)
    .set({ status: 'pending', updated_at: Math.floor(Date.now() / 1000) })
    .where(eq(pipelineRuns.id, run.id))

  const child = spawn('pnpm', ['tsx', 'src/worker/orchestrator.ts'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  })

  child.on('exit', (code) => process.exit(code ?? 0))
}

main().catch(console.error)
