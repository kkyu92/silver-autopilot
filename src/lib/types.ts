export const STEPS = [
  'scrape',
  'script',
  'tts',
  'srt',
  'video',
  'thumbnail',
  'upload',
] as const

export type StepName = (typeof STEPS)[number]
export type RunStatus = 'pending' | 'running' | 'failed' | 'done'
export type PostSource = 'nate' | 'naver_cafe' | 'bobae'

export interface PipelineRun {
  id: string
  date: string
  status: RunStatus
  current_step: StepName | null
  error_step: StepName | null
  error_message: string | null
  error_stack: string | null
  source_url: string | null
  source_content: string | null
  script: string | null
  script_title: string | null
  script_description: string | null
  script_tags: string | null
  image_prompt: string | null
  audio_path: string | null
  srt_path: string | null
  background_path: string | null
  video_path: string | null
  thumbnail_path: string | null
  youtube_id: string | null
  created_at: number
  updated_at: number
}

export interface ScrapedPost {
  id: string
  source: PostSource
  original_url: string
  title: string
  content: string
  likes: number
  comments: number
  scraped_at: number
  used: number
  pipeline_run_id: string | null
}
