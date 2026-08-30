CREATE TABLE `review_package_archives` (
  `package_id` text PRIMARY KEY NOT NULL,
  `status` text NOT NULL,
  `archive_prefix` text,
  `source_job_id` text,
  `error` text,
  `archived_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`package_id`) REFERENCES `review_packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `review_package_archives_status_idx` ON `review_package_archives` (`status`);
