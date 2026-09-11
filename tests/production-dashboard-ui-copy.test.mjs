import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../components/production-dashboard.tsx", import.meta.url), "utf8");

test("production queue uses scoped showing copy", () => {
  assert.match(source, /Showing <strong>\{visibleJobs\.length\}<\/strong> of <strong>\{scopedJobCount\}<\/strong>/);
  assert.match(source, /job\.churchSlug === churchFilter/);
});

test("production queue separates church and sermon columns", () => {
  assert.match(source, /<span>Church<\/span><span>Sermon<\/span><span>Series<\/span>/);
  assert.match(source, /production-church-cell/);
  assert.match(source, /production-sermon-cell/);
});

test("approval action uses production primary-action styling", () => {
  assert.match(source, /approval-approve production-primary-action/);
  assert.match(source, /Send for approval/);
});
