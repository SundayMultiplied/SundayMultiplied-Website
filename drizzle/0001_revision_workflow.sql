CREATE TABLE IF NOT EXISTS `review_resource_decisions` (
  `id` text PRIMARY KEY NOT NULL,
  `package_id` text NOT NULL,
  `resource_id` text NOT NULL,
  `decision` text NOT NULL,
  `reviewer_name` text NOT NULL,
  `reviewer_email` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`package_id`) REFERENCES `review_packages`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`resource_id`) REFERENCES `review_resources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `review_resource_decisions_package_resource_unique`
  ON `review_resource_decisions` (`package_id`, `resource_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `review_resource_decisions_package_idx`
  ON `review_resource_decisions` (`package_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `review_revision_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `package_id` text NOT NULL,
  `resource_id` text NOT NULL,
  `source_version` integer DEFAULT 1 NOT NULL,
  `sections_json` text NOT NULL,
  `action` text NOT NULL,
  `message` text,
  `reviewer_name` text NOT NULL,
  `reviewer_email` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`package_id`) REFERENCES `review_packages`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`resource_id`) REFERENCES `review_resources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `review_revision_requests_package_idx`
  ON `review_revision_requests` (`package_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `review_revision_requests_status_idx`
  ON `review_revision_requests` (`status`);
