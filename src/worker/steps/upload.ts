import type { PipelineRun } from '../../lib/types'
export async function runUpload(_run: PipelineRun): Promise<Partial<PipelineRun>> {
  throw new Error('upload step not implemented — Phase 7에서 구현')
}
