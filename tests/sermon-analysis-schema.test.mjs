import assert from "node:assert/strict";
import test from "node:test";

import { canonicalSermonAnalysisSchema, validateTranscriptLedAnalysis } from "../worker/sermon-analysis.ts";

const schema = canonicalSermonAnalysisSchema();

test("canonical sermon analysis is transcript-led v3", () => {
  assert.deepEqual(schema.properties.schema_version.enum, ["3.0"]);
  assert.deepEqual(schema.properties.fidelity_standard_version.enum, ["1.1"]);
  assert.deepEqual(schema.properties.source_authority.properties.policy.enum, ["transcript_led"]);
  assert.deepEqual(schema.properties.source_authority.properties.conflict_rule.enum, ["delivered_sermon_controls"]);
  assert.ok(schema.required.includes("source_authority"));
});

test("source bundle separates the transcript from every supporting source", () => {
  const sourceBundle = schema.properties.source_bundle;
  assert.ok(sourceBundle.required.includes("transcript"));
  assert.ok(sourceBundle.required.includes("supplemental_sources"));
  assert.equal(sourceBundle.properties.transcript.anyOf[1].type, "null");
  assert.equal(sourceBundle.properties.church_notes, undefined);

  const sourceTypes = sourceBundle.properties.supplemental_sources.items.properties.source_type.enum;
  assert.ok(sourceTypes.includes("pastor_notes"));
  assert.ok(sourceTypes.includes("sermon_manuscript"));
  assert.ok(sourceTypes.includes("outline"));
  assert.ok(sourceTypes.includes("supporting_document"));
});

test("every evidence record carries authority and delivery provenance", () => {
  const evidence = schema.properties.central_claim.properties.evidence.items;
  assert.ok(evidence.required.includes("source_role"));
  assert.ok(evidence.required.includes("delivery_status"));
  assert.deepEqual(evidence.properties.source_role.enum, ["controlling", "supporting", "factual", "verification_only"]);
  assert.deepEqual(evidence.properties.delivery_status.enum, ["delivered", "planned", "factual_context", "verification_only"]);
});

test("memorable structure is gated for downstream resource use", () => {
  const structure = schema.properties.memorable_structure.items;
  assert.ok(structure.required.includes("delivered_status"));
  assert.ok(structure.required.includes("use_in_resources"));
  assert.deepEqual(structure.properties.delivered_status.enum, ["explicit_in_transcript", "evident_in_transcript", "notes_only", "uncertain"]);
});

test("source comparison makes notes-only material and conflicts visible", () => {
  const comparison = schema.properties.source_comparison;
  for (const field of ["supported_by_both", "transcript_only", "notes_only_content", "delivered_departures", "source_conflicts", "transcription_corrections"]) {
    assert.ok(comparison.required.includes(field));
  }
  assert.deepEqual(comparison.properties.source_conflicts.items.properties.resolution.enum, ["follow_transcript", "human_review_required"]);
  assert.deepEqual(comparison.properties.notes_only_content.items.properties.use_in_resources.enum, ["exclude", "context_only", "human_review_required"]);
});

test("fidelity audit must explicitly protect transcript authority", () => {
  const audit = schema.properties.fidelity_audit;
  assert.ok(audit.required.includes("transcript_authority_preserved"));
  assert.ok(audit.required.includes("notes_only_content_restricted"));
});

function validationFixture() {
  return {
    schema_version: "3.0",
    fidelity_standard_version: "1.1",
    central_claim: { text: "Central claim" },
    core_tension: { text: "Core tension" },
    primary_response: { text: "Primary response" },
    major_movements: [{ title: "Movement" }],
    source_authority: {
      policy: "transcript_led",
      transcript_available: true,
      controlling_source_id: "transcript-job",
      fallback_reason: null,
      conflict_rule: "delivered_sermon_controls",
    },
    source_bundle: { transcript: { source_id: "transcript-job", role: "controlling" } },
    source_comparison: { notes_only_content: [] },
    fidelity_audit: { result: "pass" },
    sermon: {},
  };
}

test("runtime validation rejects silent use of notes-only material", () => {
  const analysis = validationFixture();
  analysis.source_comparison.notes_only_content.push({ use_in_resources: "context_only" });
  assert.throws(
    () => validateTranscriptLedAnalysis(analysis, "analysis-job", "sermon-job", { churchSlug: "sample-church", churchName: "Sample Church", weekOf: "2026-09-06" }),
    /requires human review/,
  );
});

test("runtime validation pins server-owned identity fields", () => {
  const analysis = validationFixture();
  validateTranscriptLedAnalysis(analysis, "analysis-job", "sermon-job", { churchSlug: "sample-church", churchName: "Sample Church", weekOf: "2026-09-06" });
  assert.equal(analysis.analysis_id, "analysis-job");
  assert.deepEqual(analysis.sermon, {
    sermon_id: "sermon-job",
    church_id: "sample-church",
    church_name: "Sample Church",
    sermon_date: "2026-09-06",
  });
});
