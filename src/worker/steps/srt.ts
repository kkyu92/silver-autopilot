import type { PipelineRun } from '../../lib/types'
export async function runSrt(_run: PipelineRun): Promise<Partial<PipelineRun>> {
  throw new Error('srt step not implemented — Phase 4에서 구현')
}
