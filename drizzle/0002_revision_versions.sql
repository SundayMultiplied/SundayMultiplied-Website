CREATE TABLE IF NOT EXISTS `review_revision_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `revision_request_id` text NOT NULL,
  `version` integer NOT NULL,
  `storage_key` text NOT NULL,
  `status` text DEFAULT 'ready_for_internal_review' NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`revision_request_id`) REFERENCES `review_revision_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `review_revision_versions_request_idx`
  ON `review_revision_versions` (`revision_request_id`);
