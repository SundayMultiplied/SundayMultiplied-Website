import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const api = await readFile(new URL("../worker/family-worship-override-api.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../components/family-worship-override.tsx", import.meta.url), "utf8");
const review = await readFile(new URL("../components/approval-review.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/reviews/[token]/resource/[resourceId]/worship/route.ts", import.meta.url), "utf8");

test("Family approval UI exposes a pastoral worship override without converting it into a revision", () => {
  assert.match(review, /FamilyWorshipOverride/);
  assert.match(review, /isFamily/);
  assert.match(component, /Prefer a different song\? Paste its YouTube link/);
  assert.match(component, /does not count as a revision request/);
  assert.match(component, /Restore Sunday Multiplied recommendation/);
});

test("worship override API is token-scoped, Family-only, and limited to active review statuses", () => {
  assert.match(api, /token_hash = \?/);
  assert.match(api, /kind\.toLowerCase\(\)\.includes\("family"\)/);
  assert.match(api, /ready_for_review/);
  assert.match(api, /viewed/);
  assert.match(api, /revised/);
  assert.match(api, /review_worship_overrides/);
});

test("worship override preserves the recommendation and only accepts YouTube hosts", () => {
  assert.match(api, /worship-recommended\.html/);
  assert.match(api, /youtube\.com/);
  assert.match(api, /youtu\.be/);
  assert.match(api, /family_worship_overridden/);
  assert.match(api, /family_worship_restored/);
  assert.match(api, /Selected by your church for this week's Family Multiplied resource/);
});

test("review worship route supports read, replace, and restore", () => {
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function DELETE/);
});
