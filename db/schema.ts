import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const churches = sqliteTable("churches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

export const reviewPackages = sqliteTable("review_packages", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  title: text("title").notNull(),
  seriesTitle: text("series_title"),
  weekOf: text("week_of").notNull(),
  scripture: text("scripture"),
  tokenHash: text("token_hash").notNull().unique(),
  status: text("status").notNull().default("ready_for_review"),
  reviewerName: text("reviewer_name"),
  reviewerEmail: text("reviewer_email"),
  viewedAt: text("viewed_at"),
  decidedAt: text("decided_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("review_packages_church_idx").on(table.churchId)]);

export const reviewResources = sqliteTable("review_resources", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => reviewPackages.id),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  version: integer("version").notNull().default(1),
  storageKey: text("storage_key"),
  previewUrl: text("preview_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (table) => [index("review_resources_package_idx").on(table.packageId)]);

export const reviewFeedback = sqliteTable("review_feedback", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => reviewPackages.id),
  resourceId: text("resource_id").references(() => reviewResources.id),
  reviewerName: text("reviewer_name").notNull(),
  reviewerEmail: text("reviewer_email"),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("review_feedback_package_idx").on(table.packageId)]);

export const reviewActivity = sqliteTable("review_activity", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => reviewPackages.id),
  eventType: text("event_type").notNull(),
  actorName: text("actor_name"),
  details: text("details"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("review_activity_package_idx").on(table.packageId)]);
