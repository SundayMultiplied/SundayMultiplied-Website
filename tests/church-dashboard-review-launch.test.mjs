import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardRoute = await readFile(new URL("../app/api/church-dashboard/[slug]/route.ts", import.meta.url), "utf8");
const reviewRoute = await readFile(new URL("../app/api/church-dashboard/[slug]/review-current/route.ts", import.meta.url), "utf8");
const dashboardComponent = await readFile(new URL("../components/church-dashboard.tsx", import.meta.url), "utf8");

test("dashboard exposes reviewer capability without exposing a raw review URL", () => {
  assert.match(dashboardRoute, /canReviewCurrent/);
  assert.match(dashboardRoute, /assignedReviewerEmail/);
  assert.match(dashboardRoute, /review_ready_notification_%/);
  assert.doesNotMatch(dashboardRoute, /reviewUrl\s*:/);
});

test("secure launch route authorizes reviewer and resolves the R2 manifest server-side", () => {
  assert.match(reviewRoute, /assignedReviewerEmail/);
  assert.match(reviewRoute, /reviewPackageId/);
  assert.match(reviewRoute, /production\/manifests\//);
  assert.match(reviewRoute, /safeReviewDestination/);
  assert.match(reviewRoute, /This review is assigned to another reviewer/);
  assert.match(reviewRoute, /referrer-policy/);
});

test("church dashboard only shows the direct review action when authorized", () => {
  assert.match(dashboardComponent, /canReviewCurrent: boolean/);
  assert.match(dashboardComponent, /data\.canReviewCurrent && ACTIVE_REVIEW_STATUSES\.has\(current\.status\)/);
  assert.match(dashboardComponent, /Review current package/);
  assert.match(dashboardComponent, /\/review-current/);
});
