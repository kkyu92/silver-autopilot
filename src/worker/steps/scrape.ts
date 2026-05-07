import type { PipelineRun } from '../../lib/types'

export async function runScrape(_run: PipelineRun): Promise<Partial<PipelineRun>> {
  throw new Error('scrape step not implemented — Phase 2에서 구현')
}
