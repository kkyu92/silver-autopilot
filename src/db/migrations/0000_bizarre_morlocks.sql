CREATE TABLE `pipeline_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`current_step` text,
	`error_step` text,
	`error_message` text,
	`error_stack` text,
	`source_url` text,
	`source_content` text,
	`script` text,
	`script_title` text,
	`script_description` text,
	`script_tags` text,
	`image_prompt` text,
	`audio_path` text,
	`srt_path` text,
	`background_path` text,
	`video_path` text,
	`thumbnail_path` text,
	`youtube_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pipeline_runs_date_unique` ON `pipeline_runs` (`date`);--> statement-breakpoint
CREATE TABLE `scraped_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`original_url` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`scraped_at` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`pipeline_run_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scraped_posts_original_url_unique` ON `scraped_posts` (`original_url`);