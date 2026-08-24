CREATE TABLE `churches` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `churches_slug_unique` ON `churches` (`slug`);--> statement-breakpoint
CREATE TABLE `review_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`event_type` text NOT NULL,
	`actor_name` text,
	`details` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `review_packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `review_activity_package_idx` ON `review_activity` (`package_id`);--> statement-breakpoint
CREATE TABLE `review_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`resource_id` text,
	`reviewer_name` text NOT NULL,
	`reviewer_email` text,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `review_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resource_id`) REFERENCES `review_resources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `review_feedback_package_idx` ON `review_feedback` (`package_id`);--> statement-breakpoint
CREATE TABLE `review_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`title` text NOT NULL,
	`series_title` text,
	`week_of` text NOT NULL,
	`scripture` text,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'ready_for_review' NOT NULL,
	`reviewer_name` text,
	`reviewer_email` text,
	`viewed_at` text,
	`decided_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_packages_token_hash_unique` ON `review_packages` (`token_hash`);--> statement-breakpoint
CREATE INDEX `review_packages_church_idx` ON `review_packages` (`church_id`);--> statement-breakpoint
CREATE TABLE `review_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`storage_key` text,
	`preview_url` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `review_packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `review_resources_package_idx` ON `review_resources` (`package_id`);