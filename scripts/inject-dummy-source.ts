import { eq } from 'drizzle-orm'
import { db } from '../src/db/index'
import { pipelineRuns } from '../src/db/schema'
import { DUMMY_NOOHU_SOURCE } from '../tests/fixtures/dummy-source'

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.date, today))
  if (!run) {
    console.error('해당 날짜 run 없음:', today)
    process.exit(1)
  }

  console.log('현재:', { id: run.id, error_step: run.error_step, source_len: run.source_content?.length ?? 0 })

  await db.update(pipelineRuns)
    .set({
      source_url: 'dummy://noohu-test-fixture',
      source_content: DUMMY_NOOHU_SOURCE,
      script: null,
      script_title: null,
      script_description: null,
      script_tags: null,
      image_prompt: null,
      audio_path: null,
      srt_path: null,
      status: 'pending',
      current_step: 'script',
      error_step: 'script',
      error_message: null,
      error_stack: null,
      updated_at: Math.floor(Date.now() / 1000),
    })
    .where(eq(pipelineRuns.id, run.id))

  const [updated] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, run.id))
  console.log('✅ 업데이트 완료:', {
    source_len: updated.source_content?.length ?? 0,
    status: updated.status,
    error_step: updated.error_step,
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
