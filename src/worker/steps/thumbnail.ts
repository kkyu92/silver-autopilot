import type { PipelineRun } from '../../lib/types'
export async function runThumbnail(_run: PipelineRun): Promise<Partial<PipelineRun>> {
  throw new Error('thumbnail step not implemented — Phase 6에서 구현')
}
