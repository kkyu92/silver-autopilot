import type { PipelineRun } from '../../lib/types'
export async function runScript(_run: PipelineRun): Promise<Partial<PipelineRun>> {
  throw new Error('script step not implemented — Phase 3에서 구현')
}
