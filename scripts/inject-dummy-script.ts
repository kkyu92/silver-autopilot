import { eq } from 'drizzle-orm'
import { db } from '../src/db/index'
import { pipelineRuns } from '../src/db/schema'
import { DUMMY_NOOHU_SCRIPT } from '../tests/fixtures/dummy-script'

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.date, today))
  if (!run) {
    console.error('해당 날짜 run 없음:', today)
    process.exit(1)
  }

  console.log('현재:', { id: run.id, status: run.status, error_step: run.error_step })

  await db.update(pipelineRuns)
    .set({
      script: DUMMY_NOOHU_SCRIPT,
      script_title: '시장 떡볶이 30년, 자식 셋 키운 어느 어머니 이야기',
      script_description: '남편을 일찍 보내고 시장에서 떡볶이를 팔며 자식 셋을 키운 일흔둘 김 영자 어머니의 이야기. 빚 8천만원, 새벽 4시 출근, 14년의 시간.',
      script_tags: '노후사연,인생이야기,어머니,시장,떡볶이,효도,감동사연',
      image_prompt: 'A weathered Korean woman in her 70s standing alone in an empty traditional market at dawn, soft warm lighting, emotional, cinematic',
      status: 'pending',
      current_step: 'tts',
      error_step: 'tts',
      error_message: null,
      error_stack: null,
      updated_at: Math.floor(Date.now() / 1000),
    })
    .where(eq(pipelineRuns.id, run.id))

  const [updated] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, run.id))
  console.log('✅ 주입 완료:', {
    script_len: updated.script?.length ?? 0,
    title: updated.script_title,
    error_step: updated.error_step,
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
