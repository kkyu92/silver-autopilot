import type { PipelineRun } from '../../lib/types'
export async function runTts(_run: PipelineRun): Promise<Partial<PipelineRun>> {
  throw new Error('tts step not implemented — Phase 4에서 구현')
}
