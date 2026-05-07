import type { PipelineRun } from '../../lib/types'
export async function runVideo(_run: PipelineRun): Promise<Partial<PipelineRun>> {
  throw new Error('video step not implemented — Phase 5에서 구현')
}
