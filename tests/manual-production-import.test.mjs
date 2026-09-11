import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { parseManualProductionZip, validateManualProductionImport } from "../worker/manual-production-import.ts";

const church = {
  slug: "southside-baptist",
  name: "Southside Baptist Church",
  resources: ["monday", "group", "family", "midweek"],
  baseCssUrl: "/resources/_shared/sunday-multiplied-base.css",
  cssUrl: "/resources/southside-baptist/church.css",
  logoUrl: "/api/resource-assets/southside-baptist/logo",
  familyWorship: { style: "blended", platform: "youtube" },
  midweekDelivery: { day: "wednesday", channel: "email" },
};

function analysis(overrides = {}) {
  return {
    schema_version: "3.0",
    analysis_id: "analysis-manual-test",
    fidelity_standard_version: "1.1",
    created_at: "2026-09-11T12:00:00.000Z",
    source_authority: {
      policy: "transcript_led",
      transcript_available: true,
      controlling_source_id: "transcript-manual-test",
      fallback_reason: null,
      conflict_rule: "delivered_sermon_controls",
    },
    sermon: {
      sermon_id: "sermon-southside-baptist-2026-08-23",
      church_id: "southside-baptist",
      church_name: "Southside Baptist Church",
      speaker: "Stuart Doyle",
      sermon_date: "2026-08-23",
      sermon_title: "Marriage and Divorce",
      series_title: "The King and His Kingdom",
      primary_passage: "Matthew 19:1-12",
      metadata_evidence: [],
    },
    source_bundle: { source_bundle_id: "bundle", transcript: null, supplemental_sources: [], church_metadata: [], scripture_text: [] },
    source_quality: { overall: "high", transcript_complete: true, sermon_boundary_clear: true, speaker_clear: true, material_issues: [], generation_disposition: "proceed" },
    central_claim: {}, core_tension: {}, memorable_structure: [], major_movements: [], theological_foundation: [], primary_response: {}, heart_issues: [], pastor_language_bank: [], references_and_illustrations: [], applications: [], qualifications: [],
    gospel_and_invitation: { present: false, summary: null, classification: "not_present", confidence: "high", evidence: [] },
    audience_context: [],
    source_comparison: { supported_by_both: [], transcript_only: [], notes_only_content: [], delivered_departures: [], source_conflicts: [], transcription_corrections: [] },
    unsupported_candidates_excluded: [], uncertainties: [],
    fidelity_audit: {
      all_major_claims_supported: true, all_quotes_verified: true, major_movements_identified: true, qualifications_preserved: true,
      outside_content_excluded: true, gospel_foundation_preserved: true, transcript_authority_preserved: true, notes_only_content_restricted: true,
      result: "pass", notes: [],
    },
    ...overrides,
  };
}

const styles = '<link rel="stylesheet" href="/resources/_shared/sunday-multiplied-base.css"><link rel="stylesheet" href="/resources/southside-baptist/church.css">';
const shell = (kind, content) => `<!doctype html><html><head>${styles}</head><body class="sm-resource sm-${kind}"><main class="sm-document"><header class="sm-header">Header</header>${content}<footer class="sm-footer"><p>Sunday Multiplied</p></footer></main></body></html>`;
const monday = shell("monday", '<section class="sm-section sm-section--summary">Summary</section>');
const group = shell("group", '<section class="sm-section sm-section--scripture">Scripture</section><section class="sm-section sm-section--questions">Questions</section>');
const ageGroups = ["Pre-K & Kindergarten", "Elementary", "Middle School", "High School"].map((label) => `<article class="sm-family-age-group"><h3>${label}</h3><ol><li>Question</li></ol></article>`).join("");
const family = shell("family", `<section class="sm-section sm-section--parent-note">Parent setup</section><section class="sm-section sm-section--scripture">Scripture</section><section class="sm-section sm-section--family-questions">${ageGroups}</section><section class="sm-section sm-section--worship"><a class="sm-worship-link" href="https://www.youtube.com/results?search_query=Yet%20Not%20I">Play</a></section>`);
const midweek = shell("midweek", '<section class="sm-section sm-section--summary">Remember</section><section class="sm-section sm-section--scripture">Scripture</section><section class="sm-section sm-section--reflection"><p class="sm-midweek-question">Question?</p></section><section class="sm-section sm-section--practice">Practice</section><section class="sm-section sm-section--prayer">Prayer</section>');

function validInput() {
  return {
    churchSlug: "southside-baptist",
    weekOf: "2026-08-23",
    transcriptFilename: "SBC_08232026.txt",
    transcriptText: "sermon transcript ".repeat(80),
    analysis: analysis(),
    resources: { monday, group, family, midweek },
  };
}

function packagedZip() {
  const id = "source-job-id";
  const manifest = {
    id,
    churchSlug: "southside-baptist",
    churchName: "Southside Baptist Church",
    weekOf: "2026-08-23",
    createdAt: "2026-09-11T12:00:00.000Z",
    status: "ready_for_internal_review",
    sourceFilename: "SBC_08232026.txt",
    sourceFiles: [{
      sourceId: "transcript-manual-test",
      sourceType: "transcript",
      filename: "SBC_08232026.txt",
      storageKey: `production/jobs/${id}/sources/transcript-manual-test/SBC_08232026.txt`,
      status: "analyzed",
    }],
    analysisStorageKey: `production/jobs/${id}/sermon-analysis.json`,
    analysisId: "analysis-manual-test",
    fidelityResult: "pass",
    metadata: { sermonTitle: "Marriage and Divorce", seriesTitle: "The King and His Kingdom", scripture: "Matthew 19:1-12", speaker: "Stuart Doyle", confidence: "high" },
    resources: ["monday", "group", "family", "midweek"].map((kind) => ({
      kind: kind[0].toUpperCase() + kind.slice(1),
      title: `${kind} Multiplied`,
      storageKey: `production/jobs/${id}/${kind}.html`,
      previewUrl: `/api/production/preview/${id}/${kind}`,
    })),
  };
  return zipSync({
    [`r2/production/manifests/${id}.json`]: strToU8(JSON.stringify(manifest)),
    [`r2/production/jobs/${id}/sermon-analysis.json`]: strToU8(JSON.stringify(analysis())),
    [`r2/production/jobs/${id}/sources/transcript-manual-test/SBC_08232026.txt`]: strToU8("sermon transcript ".repeat(80)),
    [`r2/production/jobs/${id}/monday.html`]: strToU8(monday),
    [`r2/production/jobs/${id}/group.html`]: strToU8(group),
    [`r2/production/jobs/${id}/family.html`]: strToU8(family),
    [`r2/production/jobs/${id}/midweek.html`]: strToU8(midweek),
  });
}

test("parses the packaged R2 layout from a single ZIP", () => {
  const parsed = parseManualProductionZip(packagedZip());
  assert.equal(parsed.churchSlug, "southside-baptist");
  assert.equal(parsed.weekOf, "2026-08-23");
  assert.equal(parsed.transcriptFilename, "SBC_08232026.txt");
  assert.equal(parsed.analysis.analysis_id, "analysis-manual-test");
  assert.match(parsed.resources.family, /sm-family-age-group/);
  assert.deepEqual(validateManualProductionImport(parsed, church), { ok: true });
});

test("accepts a current-contract manual production package", () => {
  assert.deepEqual(validateManualProductionImport(validInput(), church), { ok: true });
});

test("rejects church/date mismatches before writing to R2", () => {
  const wrongChurch = validInput();
  wrongChurch.analysis = analysis({ sermon: { ...analysis().sermon, church_id: "cbc-savannah" } });
  assert.match(validateManualProductionImport(wrongChurch, church).error, /church_id/);

  const wrongDate = validInput();
  wrongDate.analysis = analysis({ sermon: { ...analysis().sermon, sermon_date: "2026-08-30" } });
  assert.match(validateManualProductionImport(wrongDate, church).error, /sermon_date/);
});

test("rejects blocked analyses and missing subscribed resources", () => {
  const blocked = validInput();
  blocked.analysis = analysis({ fidelity_audit: { ...analysis().fidelity_audit, result: "fail" } });
  assert.match(validateManualProductionImport(blocked, church).error, /blocked/);

  const missingFamily = validInput();
  delete missingFamily.resources.family;
  assert.match(validateManualProductionImport(missingFamily, church).error, /Family HTML/);
});

test("rejects obsolete Group and Family formats", () => {
  const oldGroup = validInput();
  oldGroup.resources.group = group.replace('</section><section class="sm-section sm-section--questions">', '</section><section class="sm-section"><h2>Midweek Reinforcement</h2></section><section class="sm-section sm-section--questions">');
  assert.match(validateManualProductionImport(oldGroup, church).error, /Midweek Reinforcement/);

  const oldFamily = validInput();
  oldFamily.resources.family = shell("family", '<section class="sm-section sm-section--scripture">Scripture</section><section>Talk About It</section>');
  assert.match(validateManualProductionImport(oldFamily, church).error, /parent sermon setup|Pre-K/i);
});
