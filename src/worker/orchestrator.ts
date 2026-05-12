import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/index'
import { pipelineRuns } from '../db/schema'
import { STEPS, type PipelineRun, type StepName } from '../lib/types'
import { log } from './logger'
import { runScrape } from './steps/scrape'
import { runScript } from './steps/script'
import { runSrt } from './steps/srt'
import { runThumbnail } from './steps/thumbnail'
import { runTts } from './steps/tts'
import { runUpload } from './steps/upload'
import { runVideo } from './steps/video'

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}

async function runStep(step: StepName, run: PipelineRun): Promise<Partial<PipelineRun>> {
  switch (step) {
    case 'scrape':    return runScrape(run)
    case 'script':    return runScript(run)
    case 'tts':       return runTts(run)
    case 'srt':       return runSrt(run)
    case 'video':     return runVideo(run)
    case 'thumbnail': return runThumbnail(run)
    case 'upload':    return runUpload(run)
  }
}

async function main() {
  const today = getToday()
  log(`=== Silver Autopilot 시작 (${today}) ===`)

  let [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.date, today))

  if (run?.status === 'done') {
    log('이미 완료됨, 종료')
    return
  }

  if (!run) {
    ;[run] = await db
      .insert(pipelineRuns)
      .values({
        id: nanoid(),
        date: today,
        status: 'pending',
        current_step: 'scrape',
        created_at: now(),
        updated_at: now(),
      })
      .returning()
  }

  const startStep = (run.error_step ?? run.current_step ?? 'scrape') as StepName
  const startIndex = STEPS.indexOf(startStep)

  await db
    .update(pipelineRuns)
    .set({ status: 'running', updated_at: now() })
    .where(eq(pipelineRuns.id, run.id))

  for (const step of STEPS.slice(startIndex)) {
    await db
      .update(pipelineRuns)
      .set({ current_step: step, error_step: null, updated_at: now() })
      .where(eq(pipelineRuns.id, run.id))

    log(`[${step}] 시작`)

    try {
      const updates = await runStep(step, run as PipelineRun)
      await db
        .update(pipelineRuns)
        .set({ ...updates, updated_at: now() })
        .where(eq(pipelineRuns.id, run.id))
      run = { ...run, ...updates } as PipelineRun
      log(`[${step}] 완료`)
    } catch (err) {
      const error = err as Error
      await db
        .update(pipelineRuns)
        .set({
          status: 'failed',
          error_step: step,
          error_message: error.message,
          error_stack: error.stack ?? null,
          updated_at: now(),
        })
        .where(eq(pipelineRuns.id, run.id))
      log(`[${step}] 실패: ${error.message}`)
      log(`[ERROR] ${error.stack ?? error.message}`)
      process.exit(1)
    }
  }

  await db
    .update(pipelineRuns)
    .set({ status: 'done', updated_at: now() })
    .where(eq(pipelineRuns.id, run.id))

  log('=== 파이프라인 완료 ===')
}

main().catch((err) => {
  console.error('치명적 오류:', err)
  process.exit(1)
})
