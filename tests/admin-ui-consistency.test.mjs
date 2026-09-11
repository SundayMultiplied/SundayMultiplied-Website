import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const layout = fs.readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const adminCss = fs.readFileSync(new URL("../app/admin-ui-consistency.css", import.meta.url), "utf8");
const approvals = fs.readFileSync(new URL("../components/approval-packages-dashboard.tsx", import.meta.url), "utf8");
const onboardingHtml = fs.readFileSync(new URL("../tools/church-onboarding-agent/index.html", import.meta.url), "utf8");
const onboardingCss = fs.readFileSync(new URL("../tools/church-onboarding-agent/src/ui-consistency.css", import.meta.url), "utf8");

test("main admin loads the shared consistency layer", () => {
  assert.match(layout, /import "\.\/admin-ui-consistency\.css"/);
  assert.match(adminCss, /input\[type="file"\]::file-selector-button/);
  assert.match(adminCss, /\.revision-primary-action/);
});

test("approval package UI separates concepts and uses scoped list copy", () => {
  assert.match(approvals, /<span>Church<\/span><span>Package<\/span>/);
  assert.match(approvals, /Showing \{firstShown\}–\{lastShown\} of \{pagination\.total\}/);
  assert.match(approvals, /className="approval-secondary-action"/);
});

test("onboarding and theme editor load explicit file/control affordances", () => {
  assert.match(onboardingHtml, /ui-consistency\.css/);
  assert.match(onboardingCss, /input\[type="file"\]::file-selector-button/);
  assert.match(onboardingCss, /\.primary:hover:not\(:disabled\)/);
  assert.match(onboardingCss, /:focus-visible/);
});
