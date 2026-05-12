import { eq } from 'drizzle-orm'
import { db } from '../src/db/index'
import { pipelineRuns } from '../src/db/schema'

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const result = await db.delete(pipelineRuns).where(eq(pipelineRuns.date, today))
  console.log(`✅ ${today} run 삭제 완료. 다음 \`pnpm worker\` 실행 시 scrape부터 새로 시작.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
