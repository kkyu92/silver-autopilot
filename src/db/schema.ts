import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const pipelineRuns = sqliteTable('pipeline_runs', {
  id: text('id').primaryKey(),
  date: text('date').notNull().unique(),
  status: text('status').notNull().default('pending'),
  current_step: text('current_step'),
  error_step: text('error_step'),
  error_message: text('error_message'),
  error_stack: text('error_stack'),
  source_url: text('source_url'),
  source_content: text('source_content'),
  script: text('script'),
  script_title: text('script_title'),
  script_description: text('script_description'),
  script_tags: text('script_tags'),
  image_prompt: text('image_prompt'),
  audio_path: text('audio_path'),
  srt_path: text('srt_path'),
  background_path: text('background_path'),
  video_path: text('video_path'),
  thumbnail_path: text('thumbnail_path'),
  youtube_id: text('youtube_id'),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const scrapedPosts = sqliteTable('scraped_posts', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  original_url: text('original_url').notNull().unique(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  scraped_at: integer('scraped_at').notNull(),
  used: integer('used').notNull().default(0),
  pipeline_run_id: text('pipeline_run_id'),
})
