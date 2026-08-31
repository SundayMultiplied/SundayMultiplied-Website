type AnalysisEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

type Confidence = "high" | "medium" | "low";

type Evidence = {
  source_type: "transcript";
  source_ref: string;
  start_time: string | null;
  end_time: string | null;
  excerpt: string;
  support_type: "direct" | "supporting" | "qualification" | "metadata";
  confidence: Confidence;
};

type Claim = {
  text: string;
  classification: "direct_statement" | "faithful_synthesis";
  confidence: Confidence;
  evidence: Evidence[];
};

export type CanonicalSermonAnalysis = {
  schema_version: "2.0";
  analysis_id: string;
  fidelity_standard_version: "1.0";
  created_at: string;
  sermon: {
    sermon_id: string;
    church_id: string;
    church_name: string;
    speaker: string | null;
    sermon_date: string;
    sermon_title: string | null;
    series_title: string | null;
    primary_passage: string | null;
    metadata_evidence: Array<{ field: string; value: string | null; source_type: "transcript" | "church_metadata"; source_ref: string; confidence: Confidence }>;
  };
  source_bundle: {
    source_bundle_id: string;
    transcript: { source_id: string; name: string; sha256: string | null; authorized_use: string };
    church_notes: unknown[];
    church_metadata: unknown[];
    scripture_text: unknown[];
  };
  source_quality: {
    overall: Confidence;
    transcript_complete: boolean;
    sermon_boundary_clear: boolean;
    speaker_clear: boolean;
    material_issues: string[];
    generation_disposition: "proceed" | "proceed_with_warnings" | "human_review_required" | "blocked";
  };
  central_claim: Claim;
  core_tension: Claim;
  major_movements: Array<{
    movement_id: string;
    order: number;
    title: string;
    summary: string;
    pastor_stated_point: string | null;
    emphasis: "primary" | "major" | "supporting";
    approximate_start_time: string | null;
    approximate_end_time: string | null;
    key_explanations: string[];
    explicit_applications: string[];
    qualifications: string[];
    evidence: Evidence[];
  }>;
  theological_foundation: Claim[];
  primary_response: Claim;
  heart_issues: Claim[];
  pastor_language_bank: Array<{
    entry_id: string;
    text: string;
    language_type: "exact_quote" | "verified_short_phrase" | "paraphrase" | "uncertain_do_not_use";
    usage: string;
    start_time: string | null;
    end_time: string | null;
    confidence: Confidence;
  }>;
  references_and_illustrations: Array<{
    entry_id: string;
    kind: "scripture_reference" | "biblical_story" | "quotation" | "illustration" | "historical_or_cultural_claim";
    reference_or_name: string;
    identification: "explicitly_named" | "clearly_identifiable" | "alluded_to" | "uncertain";
    how_used: string;
    importance: "major" | "supporting" | "passing";
    evidence: Evidence[];
  }>;
  applications: Array<{
    application_id: string;
    text: string;
    classification: "explicit" | "supported";
    movement_ids: string[];
    adaptation_boundaries: string;
    confidence: Confidence;
    evidence: Evidence[];
  }>;
  qualifications: Array<{
    qualification_id: string;
    claim_governed: string;
    text: string;
    evidence: Evidence[];
  }>;
  gospel_and_invitation: {
    present: boolean;
    summary: string | null;
    classification: "explicit" | "implicit" | "not_present";
    confidence: Confidence;
    evidence: Evidence[];
  };
  audience_context: Claim[];
  unsupported_candidates_excluded: Array<{ text: string; reason_excluded: string }>;
  uncertainties: Array<{
    uncertainty_id: string;
    field_or_topic: string;
    description: string;
    impact: "none" | "minor" | "material" | "blocking";
    required_action: "none" | "retain_warning" | "human_review" | "block_generation";
  }>;
  fidelity_audit: {
    all_major_claims_supported: boolean;
    all_quotes_verified: boolean;
    major_movements_identified: boolean;
    qualifications_preserved: boolean;
    outside_content_excluded: boolean;
    gospel_foundation_preserved: boolean;
    result: "pass" | "pass_with_warnings" | "human_review_required" | "fail";
    notes: string[];
  };
};

export async function generateCanonicalSermonAnalysis(
  env: AnalysisEnv,
  input: { jobId: string; churchSlug: string; churchName: string; weekOf: string; sourceFilename: string; transcript: string },
): Promise<CanonicalSermonAnalysis> {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured for sermon analysis.");

  const analysisId = `analysis-${input.jobId}`;
  const sermonId = `sermon-${input.churchSlug}-${input.weekOf}`;
  const sourceId = `transcript-${input.jobId}`;
  const prompt = `You are creating the canonical Sunday Multiplied Sermon Analysis v2. This analysis governs every downstream resource from this sermon.

GOVERNING STANDARD
- The exact sermon transcript is the controlling source.
- Use only the transcript and supplied church/date metadata below. Do not browse, research, consult commentary, add biblical background, correct theology from outside knowledge, infer missing facts, or create applications merely because they seem biblically appropriate.
- Faithfulness to the sermon is the measure of quality.
- Read the entire sermon before choosing the central claim.
- Identify every major movement, not merely the most memorable theme.
- Preserve qualifications that would change meaning if omitted.
- Preserve the sermon's theological/gospel foundation when present; do not manufacture it when absent.
- Exact quotation language must be genuinely supported by the transcript. Otherwise classify it as paraphrase or uncertain_do_not_use.
- Applications must be explicit or tightly supported, with clear adaptation boundaries.
- Record uncertainty rather than guessing.

AUTHORIZED METADATA
Analysis ID: ${analysisId}
Sermon ID: ${sermonId}
Church ID: ${input.churchSlug}
Church Name: ${input.churchName}
Sermon Date: ${input.weekOf}
Transcript Source ID: ${sourceId}
Transcript Filename: ${input.sourceFilename}

REQUIRED ANALYSIS
1. Validate transcript/source quality and generation disposition.
2. Extract metadata conservatively: speaker, sermon title, series title, and ONE normalized contiguous primary passage such as Matthew 18:1-14. Use null when unsupported.
3. Establish one central claim broad enough to represent the whole sermon.
4. State the sermon-framed core tension.
5. Identify ALL major sermon movements in order, including stated points, explanations, applications, qualifications, emphasis, approximate timing when present, and direct evidence.
6. Preserve the theological foundation supporting the called-for response.
7. State the primary response.
8. Identify heart issues actually addressed.
9. Build a Pastor Language Bank of reusable exact/verified phrases, questions, contrasts, point titles, calls to action, qualifications, and useful paraphrases.
10. Record sermon-used Scripture references, biblical stories, quotations, major illustrations, and important historical/cultural claims, explaining how each functioned in the sermon.
11. Classify applications as explicit or supported. For supported applications, define what downstream resources may and may not adapt.
12. Preserve material qualifications.
13. Classify gospel/invitation content as explicit, implicit, or not_present.
14. Record unsupported candidate applications only when useful to document why they must be excluded.
15. Record uncertainties with impact and required action.
16. Run the fidelity audit. A pass requires major claims to have evidence, quotes to be verified/restricted, major movements identified, qualifications preserved, outside content excluded, and gospel/theological foundation faithfully handled.

EVIDENCE RULES
- Evidence must point back to transcript source ${sourceId}.
- Use the smallest excerpt sufficient to support the claim.
- Because normalized TXT/VTT may not retain timestamps, use null timestamps when timestamps are unavailable. Never invent times.
- A synthesis should normally carry multiple evidence excerpts when one excerpt is insufficient.

Return only the required structured JSON.`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.6-terra",
      input: [
        { role: "system", content: [{ type: "input_text", text: prompt }] },
        { role: "user", content: [{ type: "input_text", text: input.transcript }] },
      ],
      text: { format: { type: "json_schema", name: "sermon_analysis_v2", strict: true, schema: analysisSchema() } },
    }),
  });

  const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || "Canonical sermon analysis failed.");
  const outputText = data.output_text || (data.output || []).flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text || "").join("");
  if (!outputText) throw new Error("Canonical sermon analysis returned no output.");
  const analysis = JSON.parse(outputText) as CanonicalSermonAnalysis;
  validateAnalysis(analysis, analysisId, sermonId, input);
  return analysis;
}

function validateAnalysis(analysis: CanonicalSermonAnalysis, analysisId: string, sermonId: string, input: { churchSlug: string; churchName: string; weekOf: string }) {
  if (analysis.schema_version !== "2.0" || analysis.fidelity_standard_version !== "1.0") throw new Error("Canonical sermon analysis returned an unsupported schema version.");
  if (!analysis.central_claim?.text || !analysis.core_tension?.text || !analysis.primary_response?.text || !analysis.major_movements?.length) throw new Error("Canonical sermon analysis is missing required sermon evidence structure.");
  analysis.analysis_id = analysisId;
  analysis.sermon.sermon_id = sermonId;
  analysis.sermon.church_id = input.churchSlug;
  analysis.sermon.church_name = input.churchName;
  analysis.sermon.sermon_date = input.weekOf;
}

function analysisSchema() {
  const confidence = { type: "string", enum: ["high", "medium", "low"] };
  const nullableString = { type: ["string", "null"] };
  const stringArray = { type: "array", items: { type: "string" } };
  const evidence = {
    type: "object", additionalProperties: false,
    properties: {
      source_type: { type: "string", enum: ["transcript"] }, source_ref: { type: "string" }, start_time: nullableString, end_time: nullableString,
      excerpt: { type: "string" }, support_type: { type: "string", enum: ["direct", "supporting", "qualification", "metadata"] }, confidence,
    },
    required: ["source_type", "source_ref", "start_time", "end_time", "excerpt", "support_type", "confidence"],
  };
  const evidenceArray = { type: "array", items: evidence };
  const claim = {
    type: "object", additionalProperties: false,
    properties: { text: { type: "string" }, classification: { type: "string", enum: ["direct_statement", "faithful_synthesis"] }, confidence, evidence: evidenceArray },
    required: ["text", "classification", "confidence", "evidence"],
  };
  const emptySupplementalSource = { type: "object", additionalProperties: false, properties: {} };
  return {
    type: "object", additionalProperties: false,
    properties: {
      schema_version: { type: "string", enum: ["2.0"] }, analysis_id: { type: "string" }, fidelity_standard_version: { type: "string", enum: ["1.0"] }, created_at: { type: "string" },
      sermon: { type: "object", additionalProperties: false, properties: {
        sermon_id: { type: "string" }, church_id: { type: "string" }, church_name: { type: "string" }, speaker: nullableString, sermon_date: { type: "string" }, sermon_title: nullableString, series_title: nullableString, primary_passage: nullableString,
        metadata_evidence: { type: "array", items: { type: "object", additionalProperties: false, properties: { field: { type: "string" }, value: nullableString, source_type: { type: "string", enum: ["transcript", "church_metadata"] }, source_ref: { type: "string" }, confidence }, required: ["field", "value", "source_type", "source_ref", "confidence"] } },
      }, required: ["sermon_id", "church_id", "church_name", "speaker", "sermon_date", "sermon_title", "series_title", "primary_passage", "metadata_evidence"] },
      source_bundle: { type: "object", additionalProperties: false, properties: {
        source_bundle_id: { type: "string" }, transcript: { type: "object", additionalProperties: false, properties: { source_id: { type: "string" }, name: { type: "string" }, sha256: nullableString, authorized_use: { type: "string" } }, required: ["source_id", "name", "sha256", "authorized_use"] },
        church_notes: { type: "array", items: emptySupplementalSource }, church_metadata: { type: "array", items: emptySupplementalSource }, scripture_text: { type: "array", items: emptySupplementalSource },
      }, required: ["source_bundle_id", "transcript", "church_notes", "church_metadata", "scripture_text"] },
      source_quality: { type: "object", additionalProperties: false, properties: { overall: confidence, transcript_complete: { type: "boolean" }, sermon_boundary_clear: { type: "boolean" }, speaker_clear: { type: "boolean" }, material_issues: stringArray, generation_disposition: { type: "string", enum: ["proceed", "proceed_with_warnings", "human_review_required", "blocked"] } }, required: ["overall", "transcript_complete", "sermon_boundary_clear", "speaker_clear", "material_issues", "generation_disposition"] },
      central_claim: claim, core_tension: claim,
      major_movements: { type: "array", items: { type: "object", additionalProperties: false, properties: { movement_id: { type: "string" }, order: { type: "integer" }, title: { type: "string" }, summary: { type: "string" }, pastor_stated_point: nullableString, emphasis: { type: "string", enum: ["primary", "major", "supporting"] }, approximate_start_time: nullableString, approximate_end_time: nullableString, key_explanations: stringArray, explicit_applications: stringArray, qualifications: stringArray, evidence: evidenceArray }, required: ["movement_id", "order", "title", "summary", "pastor_stated_point", "emphasis", "approximate_start_time", "approximate_end_time", "key_explanations", "explicit_applications", "qualifications", "evidence"] } },
      theological_foundation: { type: "array", items: claim }, primary_response: claim, heart_issues: { type: "array", items: claim },
      pastor_language_bank: { type: "array", items: { type: "object", additionalProperties: false, properties: { entry_id: { type: "string" }, text: { type: "string" }, language_type: { type: "string", enum: ["exact_quote", "verified_short_phrase", "paraphrase", "uncertain_do_not_use"] }, usage: { type: "string" }, start_time: nullableString, end_time: nullableString, confidence }, required: ["entry_id", "text", "language_type", "usage", "start_time", "end_time", "confidence"] } },
      references_and_illustrations: { type: "array", items: { type: "object", additionalProperties: false, properties: { entry_id: { type: "string" }, kind: { type: "string", enum: ["scripture_reference", "biblical_story", "quotation", "illustration", "historical_or_cultural_claim"] }, reference_or_name: { type: "string" }, identification: { type: "string", enum: ["explicitly_named", "clearly_identifiable", "alluded_to", "uncertain"] }, how_used: { type: "string" }, importance: { type: "string", enum: ["major", "supporting", "passing"] }, evidence: evidenceArray }, required: ["entry_id", "kind", "reference_or_name", "identification", "how_used", "importance", "evidence"] } },
      applications: { type: "array", items: { type: "object", additionalProperties: false, properties: { application_id: { type: "string" }, text: { type: "string" }, classification: { type: "string", enum: ["explicit", "supported"] }, movement_ids: stringArray, adaptation_boundaries: { type: "string" }, confidence, evidence: evidenceArray }, required: ["application_id", "text", "classification", "movement_ids", "adaptation_boundaries", "confidence", "evidence"] } },
      qualifications: { type: "array", items: { type: "object", additionalProperties: false, properties: { qualification_id: { type: "string" }, claim_governed: { type: "string" }, text: { type: "string" }, evidence: evidenceArray }, required: ["qualification_id", "claim_governed", "text", "evidence"] } },
      gospel_and_invitation: { type: "object", additionalProperties: false, properties: { present: { type: "boolean" }, summary: nullableString, classification: { type: "string", enum: ["explicit", "implicit", "not_present"] }, confidence, evidence: evidenceArray }, required: ["present", "summary", "classification", "confidence", "evidence"] },
      audience_context: { type: "array", items: claim }, unsupported_candidates_excluded: { type: "array", items: { type: "object", additionalProperties: false, properties: { text: { type: "string" }, reason_excluded: { type: "string" } }, required: ["text", "reason_excluded"] } },
      uncertainties: { type: "array", items: { type: "object", additionalProperties: false, properties: { uncertainty_id: { type: "string" }, field_or_topic: { type: "string" }, description: { type: "string" }, impact: { type: "string", enum: ["none", "minor", "material", "blocking"] }, required_action: { type: "string", enum: ["none", "retain_warning", "human_review", "block_generation"] } }, required: ["uncertainty_id", "field_or_topic", "description", "impact", "required_action"] } },
      fidelity_audit: { type: "object", additionalProperties: false, properties: { all_major_claims_supported: { type: "boolean" }, all_quotes_verified: { type: "boolean" }, major_movements_identified: { type: "boolean" }, qualifications_preserved: { type: "boolean" }, outside_content_excluded: { type: "boolean" }, gospel_foundation_preserved: { type: "boolean" }, result: { type: "string", enum: ["pass", "pass_with_warnings", "human_review_required", "fail"] }, notes: stringArray }, required: ["all_major_claims_supported", "all_quotes_verified", "major_movements_identified", "qualifications_preserved", "outside_content_excluded", "gospel_foundation_preserved", "result", "notes"] },
    },
    required: ["schema_version", "analysis_id", "fidelity_standard_version", "created_at", "sermon", "source_bundle", "source_quality", "central_claim", "core_tension", "major_movements", "theological_foundation", "primary_response", "heart_issues", "pastor_language_bank", "references_and_illustrations", "applications", "qualifications", "gospel_and_invitation", "audience_context", "unsupported_candidates_excluded", "uncertainties", "fidelity_audit"],
  };
}
