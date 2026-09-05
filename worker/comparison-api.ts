import type { CanonicalSermonAnalysis } from "./sermon-analysis";
import {
  CHURCHES,
  enforceResourceStyling,
  extractOutputText,
  generateResourcesFromAnalysis,
  normalizeTranscript,
  type ChurchConfig,
  type GeneratedPackage,
  type ProductionEnv,
  type ProductionManifest,
} from "./production-api";
import { injectBsbScripture, resolveBsbPassage } from "./scripture-service";

type VariantLabel = "A" | "B" | "C";
type RecipeVersion = "v1" | "v2" | "v3";
type ResourceKind = "monday" | "group" | "family";
type ComparisonRatings = {
  sermonConnection: VariantLabel;
  pastoralVoice: VariantLabel;
  realLifeUse: VariantLabel;
  overall: VariantLabel;
};

type ComparisonManifest = {
  id: string;
  sourceJobId: string;
  churchSlug: string;
  churchName: string;
  weekOf: string;
  sermonTitle: string;
  createdAt: string;
  reviewUrl: string;
  blindOrder: Record<VariantLabel, RecipeVersion>;
  variants: Array<{ label: VariantLabel; version: RecipeVersion; resources: Array<{ kind: ResourceKind; previewUrl: string }> }>;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };

export async function handleComparisonApi(request: Request, env: ProductionEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const previewMatch = url.pathname.match(/^\/api\/comparison-preview\/([^/]+)\/([ABC])\/(monday|group|family)$/);
  const publicReviewMatch = url.pathname.match(/^\/api\/comparison-reviews\/([^/]+)$/);
  const feedbackMatch = url.pathname.match(/^\/api\/comparison-reviews\/([^/]+)\/feedback$/);
  const adminDetailMatch = url.pathname.match(/^\/api\/comparisons\/([^/]+)$/);

  if (previewMatch && request.method === "GET") return servePreview(env, previewMatch[1], previewMatch[2] as VariantLabel, previewMatch[3] as ResourceKind);
  if (publicReviewMatch && request.method === "GET") return getPublicReview(env, publicReviewMatch[1]);
  if (feedbackMatch && request.method === "POST") return saveFeedback(request, env, feedbackMatch[1]);

  if (url.pathname.startsWith("/api/comparisons")) {
    const authError = adminAuthorizationError(request, env);
    if (authError) return json({ error: authError }, 401);
  }
  if (url.pathname === "/api/comparisons" && request.method === "GET") return listComparisons(env);
  if (url.pathname === "/api/comparisons" && request.method === "POST") return createComparison(request, env);
  if (adminDetailMatch && request.method === "GET") return getAdminComparison(env, adminDetailMatch[1]);
  return null;
}

async function createComparison(request: Request, env: ProductionEnv) {
  if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
  if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured." }, 503);
  const body = await request.json().catch(() => ({})) as { jobId?: string };
  const jobId = clean(body.jobId || "", 100);
  if (!jobId) return json({ error: "Choose a production job." }, 400);
  const manifest = await loadProductionManifest(env.BUCKET, jobId);
  if (!manifest) return json({ error: "Production job not found." }, 404);
  const church = CHURCHES.find((item) => item.slug === manifest.churchSlug);
  if (!church) return json({ error: "Church configuration is unavailable." }, 409);
  const transcript = await loadTranscript(env.BUCKET, manifest);
  if (!transcript) return json({ error: "The original transcript is unavailable for this job." }, 404);
  const analysis = await loadV3Analysis(env.BUCKET, manifest);
  if (!analysis) return json({ error: "A V3 sermon analysis is required before creating a comparison." }, 409);
  if (analysis.schema_version !== "3.0") return json({ error: "This older package does not contain a V3 analysis. Create a new source bundle before comparing V1, V2, and V3." }, 409);

  const id = crypto.randomUUID();
  try {
    const [v1, v2Analysis, v3] = await Promise.all([
      generateV1Resources(env, church, manifest.weekOf, transcript),
      generateV2Analysis(env, manifest, transcript, id),
      generateResourcesFromAnalysis(env, church, manifest.weekOf, analysis),
    ]);
    const v2 = await generateV2Resources(env, church, manifest.weekOf, v2Analysis);
    await env.BUCKET.put(`production/comparisons/${id}/v2-analysis.json`, JSON.stringify(v2Analysis, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8" } });

    const origin = env.PUBLIC_SITE_ORIGIN || new URL(request.url).origin;
    const blindOrder = shuffledVersions();
    const packages: Record<RecipeVersion, GeneratedPackage> = { v1, v2, v3 };
    const variants: ComparisonManifest["variants"] = [];
    for (const label of ["A", "B", "C"] as VariantLabel[]) {
      const version = blindOrder[label];
      const generated = packages[version];
      const resources: ComparisonManifest["variants"][number]["resources"] = [];
      for (const kind of church.resources) {
        const rawHtml = generated.resources[kind];
        if (!rawHtml) continue;
        let html = enforceResourceStyling(rawHtml, church, kind);
        if (kind === "group" || kind === "family") {
          const reference = generated.metadata.scripture || analysis.sermon.primary_passage || "";
          if (!reference) throw new Error(`${version.toUpperCase()} did not establish the primary Scripture needed for ${kind}.`);
          html = injectBsbScripture(html, await resolveBsbPassage(reference));
        }
        await env.BUCKET.put(`production/comparisons/${id}/${label}/${kind}.html`, html, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
        resources.push({ kind, previewUrl: `${origin}/api/comparison-preview/${id}/${label}/${kind}` });
      }
      variants.push({ label, version, resources });
    }
    const comparison: ComparisonManifest = {
      id,
      sourceJobId: manifest.id,
      churchSlug: manifest.churchSlug,
      churchName: manifest.churchName,
      weekOf: manifest.weekOf,
      sermonTitle: manifest.metadata.sermonTitle || analysis.sermon.sermon_title || "Untitled sermon",
      createdAt: new Date().toISOString(),
      reviewUrl: `${origin}/compare/${id}`,
      blindOrder,
      variants,
    };
    await saveComparison(env.BUCKET, comparison);
    return json({ ok: true, comparison }, 201);
  } catch (error) {
    console.error("comparison_generation_failed", { jobId, id, error });
    return json({ error: error instanceof Error ? clean(error.message, 500) : "Comparison generation failed." }, 502);
  }
}

async function listComparisons(env: ProductionEnv) {
  if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
  const listed = await env.BUCKET.list({ prefix: "production/comparison-manifests/", limit: 50 });
  const comparisons: ComparisonManifest[] = [];
  for (const item of listed.objects) {
    const object = await env.BUCKET.get(item.key);
    if (!object) continue;
    try { comparisons.push(await object.json<ComparisonManifest>()); } catch { /* Ignore malformed records. */ }
  }
  comparisons.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const withFeedback = await Promise.all(comparisons.map(async (comparison) => ({ ...comparison, feedback: await loadFeedback(env.BUCKET!, comparison.id) })));
  return json({ comparisons: withFeedback });
}

async function getAdminComparison(env: ProductionEnv, id: string) {
  if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
  const comparison = await loadComparison(env.BUCKET, id);
  if (!comparison) return json({ error: "Comparison not found." }, 404);
  const feedback = await loadFeedback(env.BUCKET, id);
  return json({ comparison, feedback });
}

async function getPublicReview(env: ProductionEnv, id: string) {
  if (!env.BUCKET) return json({ error: "Comparison storage is unavailable." }, 503);
  const comparison = await loadComparison(env.BUCKET, id);
  if (!comparison) return json({ error: "Comparison not found." }, 404);
  return json({ comparison: {
    id: comparison.id,
    churchName: comparison.churchName,
    weekOf: comparison.weekOf,
    sermonTitle: comparison.sermonTitle,
    variants: comparison.variants.map((variant: ComparisonManifest["variants"][number]) => ({ label: variant.label, resources: variant.resources })),
  } });
}

async function saveFeedback(request: Request, env: ProductionEnv, id: string) {
  if (!env.BUCKET) return json({ error: "Comparison storage is unavailable." }, 503);
  if (!await loadComparison(env.BUCKET, id)) return json({ error: "Comparison not found." }, 404);
  const body = await request.json().catch(() => ({})) as { reviewerName?: string; ratings?: Partial<Record<keyof ComparisonRatings, string>>; notes?: string };
  const ratingKeys: Array<keyof ComparisonRatings> = ["sermonConnection", "pastoralVoice", "realLifeUse", "overall"];
  if (!body.ratings || ratingKeys.some((key) => !["A", "B", "C"].includes(body.ratings?.[key] || ""))) {
    return json({ error: "Choose A, B, or C for each comparison question." }, 400);
  }
  const ratings = Object.fromEntries(ratingKeys.map((key) => [key, body.ratings?.[key]])) as ComparisonRatings;
  const feedbackId = crypto.randomUUID();
  const feedback = {
    id: feedbackId,
    comparisonId: id,
    reviewerName: clean(body.reviewerName || "Anonymous reviewer", 100),
    preferred: ratings.overall,
    ratings,
    notes: clean(body.notes || "", 2000),
    createdAt: new Date().toISOString(),
  };
  await env.BUCKET.put(`production/comparisons/${id}/feedback/${feedbackId}.json`, JSON.stringify(feedback, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  return json({ ok: true });
}

async function servePreview(env: ProductionEnv, id: string, label: VariantLabel, kind: ResourceKind) {
  if (!env.BUCKET) return new Response("Comparison storage is unavailable.", { status: 503 });
  const object = await env.BUCKET.get(`production/comparisons/${id}/${label}/${kind}.html`);
  if (!object) return new Response("Comparison resource not found.", { status: 404 });
  return new Response(object.body, { headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "private, no-store",
    "x-robots-tag": "noindex, nofollow, noarchive",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'",
  } });
}

async function loadFeedback(bucket: R2Bucket, id: string) {
  const listed = await bucket.list({ prefix: `production/comparisons/${id}/feedback/`, limit: 100 });
  const feedback: unknown[] = [];
  for (const item of listed.objects) {
    const object = await bucket.get(item.key);
    if (!object) continue;
    try { feedback.push(await object.json()); } catch { /* Ignore malformed feedback. */ }
  }
  return feedback;
}

async function loadTranscript(bucket: R2Bucket, manifest: ProductionManifest) {
  const source = manifest.sourceFiles?.find((item) => item.sourceType === "transcript");
  const key = source?.storageKey || `production/jobs/${manifest.id}/transcript.txt`;
  const object = await bucket.get(key);
  if (!object) return "";
  return normalizeTranscript(await object.text(), source?.filename || manifest.sourceFilename || "transcript.txt");
}

async function loadProductionManifest(bucket: R2Bucket, id: string) {
  const object = await bucket.get(`production/manifests/${id}.json`);
  if (!object) return null;
  try { return await object.json<ProductionManifest>(); } catch { return null; }
}

async function loadV3Analysis(bucket: R2Bucket, manifest: ProductionManifest) {
  if (!manifest.analysisStorageKey) return null;
  const object = await bucket.get(manifest.analysisStorageKey);
  if (!object) return null;
  try { return await object.json<CanonicalSermonAnalysis>(); } catch { return null; }
}

async function saveComparison(bucket: R2Bucket, comparison: ComparisonManifest) {
  await bucket.put(`production/comparison-manifests/${comparison.id}.json`, JSON.stringify(comparison, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
}

async function loadComparison(bucket: R2Bucket, id: string) {
  const object = await bucket.get(`production/comparison-manifests/${id}.json`);
  if (!object) return null;
  try { return await object.json<ComparisonManifest>(); } catch { return null; }
}

function shuffledVersions(): Record<VariantLabel, RecipeVersion> {
  const versions: RecipeVersion[] = ["v1", "v2", "v3"];
  for (let index = versions.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [versions[index], versions[swap]] = [versions[swap], versions[index]];
  }
  return { A: versions[0], B: versions[1], C: versions[2] };
}

async function generateV1Resources(env: ProductionEnv, church: ChurchConfig, weekOf: string, transcript: string): Promise<GeneratedPackage> {
  const prompt = `You are the production engine for Sunday Multiplied. Analyze the attached sermon transcript and create production-ready sermon-based discipleship resources for ${church.name}.

Generate these resources: ${church.resources.join(", ")}.
Sermon date: ${weekOf}.
Shared Sunday Multiplied CSS URL: ${church.baseCssUrl}.
Church brand CSS URL: ${church.cssUrl}.
Church logo URL: ${church.logoUrl || "none"}.

CONTENT RULES:
- Stay faithful to the pastor's actual message. Do not create generic devotional content.
- Extract sermon title, series title, speaker, main Scripture passage, and an overall metadata confidence level. Use an empty string when title/series/speaker cannot be established.
- Return the primary Scripture as one normalized contiguous reference such as "Matthew 18:1-14" or "Genesis 1:1-2". Do not combine secondary references into this field.
- Monday Multiplied: sermon recap, 3 key takeaways, reflection question, short prayer. Include the primary Scripture reference, not the full passage text.
- Group Multiplied: Big Idea, The Tension, Sermon Snapshot, 3-5 Key Moments, 5-7 questions grouped Understand/Reflect/Apply, Practice This Week, Midweek Reinforcement, Leader Tip, Closing Prayer. Include a Scripture section and the primary Scripture reference. Do not generate or paraphrase the passage text; exact BSB text is inserted by the production system after generation.
- Family Multiplied: a short family dinner-table resource rooted in the sermon with a simple big idea, a Scripture section/read-together area using the primary reference, age-flexible discussion questions, one practical family activity, and a short prayer. Do not generate or paraphrase the passage text; exact BSB text is inserted by the production system after generation.

HTML AND STYLING CONTRACT — FOLLOW THIS EXACTLY FOR EVERY RESOURCE:
- Return a complete standalone HTML document with <!doctype html>, <html>, <head>, and <body>.
- Include these two stylesheet links, in this order:
  <link rel="stylesheet" href="${church.baseCssUrl}">
  <link rel="stylesheet" href="${church.cssUrl}">
- Never use inline styles and never invent a separate layout system.
- Body class must be "sm-resource sm-monday", "sm-resource sm-group", or "sm-resource sm-family" as appropriate.
- The page wrapper must be <main class="sm-document">.
- Header must use <header class="sm-header sm-header--with-logo"> containing <div class="sm-header-content">, <div class="sm-header-text">, <p class="sm-eyebrow sm-resource-label">, <h1 class="sm-title">, and <p class="sm-meta">.
- If a logo URL is present, place it inside <div class="sm-header-logo-wrap"> as <img class="sm-church-logo sm-logo" src="${church.logoUrl || ""}" alt="${church.name} logo">.
- Every content section must include class "sm-section" plus an appropriate modifier when one exists.
- Use these established section modifiers where applicable: sm-section--scripture, sm-section--summary, sm-section--takeaways, sm-section--reflection, sm-section--big-idea, sm-section--tension, sm-section--key-moments, sm-section--questions, sm-section--application, sm-section--practice, sm-section--leader-tip, sm-section--parent-note, sm-section--family-remember, sm-section--prayer.
- Group and Family must include exactly one section with class "sm-section sm-section--scripture". The production system replaces its contents with exact BSB text.
- Scripture references must use class "sm-scripture-reference".
- Group discussion clusters must use <div class="sm-question-group"> with <h3>Understand</h3>, <h3>Reflect</h3>, or <h3>Apply</h3> as appropriate.
- Practice components may use sm-practice-scenario, sm-practice-task, sm-practice-share, and sm-practice-debrief.
- End with <footer class="sm-footer"><p>Sunday Multiplied</p></footer> inside sm-document.
- Do not create alternative classes for the header, document wrapper, sections, question groups, Scripture reference, or footer. The CSS depends on this contract.
- Return only the requested JSON structure.`;
  const schema = packageSchema(true);
  const parsed = await callStructured(env, prompt, transcript, "sunday_multiplied_v1_package", schema) as GeneratedPackage;
  return parsed;
}

async function generateV2Resources(env: ProductionEnv, church: ChurchConfig, weekOf: string, analysis: Record<string, unknown>): Promise<GeneratedPackage> {
  const sermon = analysis.sermon as Record<string, unknown>;
  const quality = analysis.source_quality as Record<string, unknown>;
  const metadata: GeneratedPackage["metadata"] = {
    sermonTitle: String(sermon.sermon_title || ""), seriesTitle: String(sermon.series_title || ""), scripture: String(sermon.primary_passage || ""), speaker: String(sermon.speaker || ""), confidence: (quality.overall || "low") as "high" | "medium" | "low",
  };
  const prompt = `You are the Sunday Multiplied resource production engine. Create production-ready discipleship resources from the APPROVED CANONICAL SERMON ANALYSIS below.

AUTHORITY ORDER
1. Sunday Multiplied Sermon Fidelity Standard v1.0.
2. The supplied Canonical Sermon Analysis v2.
3. The resource format requirements below.

The analysis is the governing evidence map. Do not add sermon claims, theology, quotations, applications, illustrations, references, or pastoral intent that are not supported there. Prefer Pastor Language Bank wording. Preserve qualifications. Represent the sermon's complete major-movement arc rather than narrowing everything to one attractive theme. Use only applications classified explicit or supported and stay inside adaptation_boundaries.

Generate these resources: ${church.resources.join(", ")}.
Church: ${church.name}. Sermon date: ${weekOf}. Shared CSS: ${church.baseCssUrl}. Church CSS: ${church.cssUrl}. Church logo: ${church.logoUrl || "none"}. Primary Scripture: ${metadata.scripture || "not established"}.

CONTENT REQUIREMENTS
- Monday: concise sermon recap preserving the whole arc, 2-3 distinct supported takeaways, one reflection question, short sermon-rooted prayer. Scripture reference only.
- Group: Big Idea, Tension, Sermon Snapshot, 3-5 Key Moments covering all major movements, 4-6 natural questions across Understand/Reflect/Apply, Practice This Week, Midweek Reinforcement, sermon-specific Leader Tip, Closing Prayer. Include exactly one Scripture section but do not write Scripture text.
- Family: short family dinner-table resource. It may narrow to the most family-usable response, but its framing must not contradict or erase the sermon arc. Include simple big idea, exactly one Scripture section without passage text, age-flexible questions, supported family activity/application, and short prayer.
- Quotation marks may only be used for exact_quote or verified_short_phrase entries from the Pastor Language Bank.
- Do not create filler merely to hit a preferred count.

HTML CONTRACT
- Complete standalone HTML; no inline styles.
- Stylesheet links in order: ${church.baseCssUrl}, then ${church.cssUrl}.
- Body classes: sm-resource sm-monday|sm-group|sm-family.
- Wrapper: <main class="sm-document">.
- Header: sm-header sm-header--with-logo > sm-header-content with sm-header-text, sm-eyebrow sm-resource-label, sm-title, sm-meta. Logo in sm-header-logo-wrap with img sm-church-logo sm-logo using ${church.logoUrl || ""} when present.
- Every content section uses sm-section plus the appropriate established modifier: sm-section--scripture, --summary, --takeaways, --reflection, --big-idea, --tension, --key-moments, --questions, --application, --practice, --leader-tip, --parent-note, --family-remember, --prayer.
- Group/Family include exactly one sm-section sm-section--scripture. Scripture reference uses sm-scripture-reference.
- Group question clusters use sm-question-group with Understand, Reflect, Apply headings.
- Practice may use sm-practice-scenario, sm-practice-task, sm-practice-share, sm-practice-debrief.
- Footer inside sm-document: <footer class="sm-footer"><p>Sunday Multiplied</p></footer>.

Return only the requested JSON structure.`;
  const parsed = await callStructured(env, prompt, JSON.stringify(analysis), "sunday_multiplied_v2_resources", packageSchema(false)) as { resources: GeneratedPackage["resources"] };
  return { metadata, resources: parsed.resources };
}

async function generateV2Analysis(env: ProductionEnv, manifest: ProductionManifest, transcript: string, comparisonId: string) {
  const analysisId = `comparison-${comparisonId}-v2`;
  const sermonId = `sermon-${manifest.churchSlug}-${manifest.weekOf}`;
  const sourceId = `transcript-${manifest.id}`;
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
Church ID: ${manifest.churchSlug}
Church Name: ${manifest.churchName}
Sermon Date: ${manifest.weekOf}
Transcript Source ID: ${sourceId}
Transcript Filename: ${manifest.sourceFilename}

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
  const analysis = await callStructured(env, prompt, transcript, "sermon_analysis_v2", v2AnalysisSchema()) as Record<string, unknown>;
  analysis.analysis_id = analysisId;
  const sermon = analysis.sermon as Record<string, unknown>;
  sermon.sermon_id = sermonId; sermon.church_id = manifest.churchSlug; sermon.church_name = manifest.churchName; sermon.sermon_date = manifest.weekOf;
  return analysis;
}

async function callStructured(env: ProductionEnv, prompt: string, input: string, name: string, schema: Record<string, unknown>) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: env.OPENAI_MODEL || "gpt-5.6-terra", input: [{ role: "system", content: [{ type: "input_text", text: prompt }] }, { role: "user", content: [{ type: "input_text", text: input }] }], text: { format: { type: "json_schema", name, strict: true, schema } } }),
  });
  const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `${name} generation failed.`);
  const output = data.output_text || extractOutputText(data.output);
  if (!output) throw new Error(`${name} returned no output.`);
  return JSON.parse(output) as unknown;
}

function packageSchema(includeMetadata: boolean) {
  const properties: Record<string, unknown> = { resources: { type: "object", additionalProperties: false, properties: { monday: { type: "string" }, group: { type: "string" }, family: { type: "string" } }, required: ["monday", "group", "family"] } };
  const required = ["resources"];
  if (includeMetadata) {
    properties.metadata = { type: "object", additionalProperties: false, properties: { sermonTitle: { type: "string" }, seriesTitle: { type: "string" }, scripture: { type: "string" }, speaker: { type: "string" }, confidence: { type: "string", enum: ["high", "medium", "low"] } }, required: ["sermonTitle", "seriesTitle", "scripture", "speaker", "confidence"] };
    required.unshift("metadata");
  }
  return { type: "object", additionalProperties: false, properties, required };
}

function v2AnalysisSchema() {
  const confidence = { type: "string", enum: ["high", "medium", "low"] };
  const nullable = { type: ["string", "null"] };
  const strings = { type: "array", items: { type: "string" } };
  const evidence = { type: "object", additionalProperties: false, properties: { source_type: { type: "string", enum: ["transcript"] }, source_ref: { type: "string" }, start_time: nullable, end_time: nullable, excerpt: { type: "string" }, support_type: { type: "string", enum: ["direct", "supporting", "qualification", "metadata"] }, confidence }, required: ["source_type", "source_ref", "start_time", "end_time", "excerpt", "support_type", "confidence"] };
  const evidences = { type: "array", items: evidence };
  const claim = { type: "object", additionalProperties: false, properties: { text: { type: "string" }, classification: { type: "string", enum: ["direct_statement", "faithful_synthesis"] }, confidence, evidence: evidences }, required: ["text", "classification", "confidence", "evidence"] };
  const claims = { type: "array", items: claim };
  const objectArray = (properties: Record<string, unknown>, required: string[]) => ({ type: "array", items: { type: "object", additionalProperties: false, properties, required } });
  const schema = { type: "object", additionalProperties: false, properties: {
    schema_version: { type: "string", enum: ["2.0"] }, analysis_id: { type: "string" }, fidelity_standard_version: { type: "string", enum: ["1.0"] }, created_at: { type: "string" },
    sermon: { type: "object", additionalProperties: false, properties: { sermon_id: { type: "string" }, church_id: { type: "string" }, church_name: { type: "string" }, speaker: nullable, sermon_date: { type: "string" }, sermon_title: nullable, series_title: nullable, primary_passage: nullable, metadata_evidence: objectArray({ field: { type: "string" }, value: nullable, source_type: { type: "string", enum: ["transcript", "church_metadata"] }, source_ref: { type: "string" }, confidence }, ["field", "value", "source_type", "source_ref", "confidence"]) }, required: ["sermon_id", "church_id", "church_name", "speaker", "sermon_date", "sermon_title", "series_title", "primary_passage", "metadata_evidence"] },
    source_bundle: { type: "object", additionalProperties: false, properties: { source_bundle_id: { type: "string" }, transcript: { type: "object", additionalProperties: false, properties: { source_id: { type: "string" }, name: { type: "string" }, sha256: nullable, authorized_use: { type: "string" } }, required: ["source_id", "name", "sha256", "authorized_use"] }, church_notes: strings, church_metadata: strings, scripture_text: strings }, required: ["source_bundle_id", "transcript", "church_notes", "church_metadata", "scripture_text"] },
    source_quality: { type: "object", additionalProperties: false, properties: { overall: confidence, transcript_complete: { type: "boolean" }, sermon_boundary_clear: { type: "boolean" }, speaker_clear: { type: "boolean" }, material_issues: strings, generation_disposition: { type: "string", enum: ["proceed", "proceed_with_warnings", "human_review_required", "blocked"] } }, required: ["overall", "transcript_complete", "sermon_boundary_clear", "speaker_clear", "material_issues", "generation_disposition"] },
    central_claim: claim, core_tension: claim,
    major_movements: objectArray({ movement_id: { type: "string" }, order: { type: "integer" }, title: { type: "string" }, summary: { type: "string" }, pastor_stated_point: nullable, emphasis: { type: "string", enum: ["primary", "major", "supporting"] }, approximate_start_time: nullable, approximate_end_time: nullable, key_explanations: strings, explicit_applications: strings, qualifications: strings, evidence: evidences }, ["movement_id", "order", "title", "summary", "pastor_stated_point", "emphasis", "approximate_start_time", "approximate_end_time", "key_explanations", "explicit_applications", "qualifications", "evidence"]),
    theological_foundation: claims, primary_response: claim, heart_issues: claims,
    pastor_language_bank: objectArray({ entry_id: { type: "string" }, text: { type: "string" }, language_type: { type: "string", enum: ["exact_quote", "verified_short_phrase", "paraphrase", "uncertain_do_not_use"] }, usage: { type: "string" }, start_time: nullable, end_time: nullable, confidence }, ["entry_id", "text", "language_type", "usage", "start_time", "end_time", "confidence"]),
    references_and_illustrations: objectArray({ entry_id: { type: "string" }, kind: { type: "string", enum: ["scripture_reference", "biblical_story", "quotation", "illustration", "historical_or_cultural_claim"] }, reference_or_name: { type: "string" }, identification: { type: "string", enum: ["explicitly_named", "clearly_identifiable", "alluded_to", "uncertain"] }, how_used: { type: "string" }, importance: { type: "string", enum: ["major", "supporting", "passing"] }, evidence: evidences }, ["entry_id", "kind", "reference_or_name", "identification", "how_used", "importance", "evidence"]),
    applications: objectArray({ application_id: { type: "string" }, text: { type: "string" }, classification: { type: "string", enum: ["explicit", "supported"] }, movement_ids: strings, adaptation_boundaries: { type: "string" }, confidence, evidence: evidences }, ["application_id", "text", "classification", "movement_ids", "adaptation_boundaries", "confidence", "evidence"]),
    qualifications: objectArray({ qualification_id: { type: "string" }, claim_governed: { type: "string" }, text: { type: "string" }, evidence: evidences }, ["qualification_id", "claim_governed", "text", "evidence"]),
    gospel_and_invitation: { type: "object", additionalProperties: false, properties: { present: { type: "boolean" }, summary: nullable, classification: { type: "string", enum: ["explicit", "implicit", "not_present"] }, confidence, evidence: evidences }, required: ["present", "summary", "classification", "confidence", "evidence"] },
    audience_context: claims,
    unsupported_candidates_excluded: objectArray({ text: { type: "string" }, reason_excluded: { type: "string" } }, ["text", "reason_excluded"]),
    uncertainties: objectArray({ uncertainty_id: { type: "string" }, field_or_topic: { type: "string" }, description: { type: "string" }, impact: { type: "string", enum: ["none", "minor", "material", "blocking"] }, required_action: { type: "string", enum: ["none", "retain_warning", "human_review", "block_generation"] } }, ["uncertainty_id", "field_or_topic", "description", "impact", "required_action"]),
    fidelity_audit: { type: "object", additionalProperties: false, properties: { all_major_claims_supported: { type: "boolean" }, all_quotes_verified: { type: "boolean" }, major_movements_identified: { type: "boolean" }, qualifications_preserved: { type: "boolean" }, outside_content_excluded: { type: "boolean" }, gospel_foundation_preserved: { type: "boolean" }, result: { type: "string", enum: ["pass", "pass_with_warnings", "human_review_required", "fail"] }, notes: strings }, required: ["all_major_claims_supported", "all_quotes_verified", "major_movements_identified", "qualifications_preserved", "outside_content_excluded", "gospel_foundation_preserved", "result", "notes"] },
  }, required: ["schema_version", "analysis_id", "fidelity_standard_version", "created_at", "sermon", "source_bundle", "source_quality", "central_claim", "core_tension", "major_movements", "theological_foundation", "primary_response", "heart_issues", "pastor_language_bank", "references_and_illustrations", "applications", "qualifications", "gospel_and_invitation", "audience_context", "unsupported_candidates_excluded", "uncertainties", "fidelity_audit"] };
  return schema;
}

function adminAuthorizationError(request: Request, env: ProductionEnv) {
  const email = accessIdentityEmail(request);
  const adminEmail = env.APPROVAL_ADMIN_EMAIL?.trim() || "brian@sundaymultiplied.com";
  return !email || email.toLowerCase() !== adminEmail.toLowerCase() ? "Unauthorized." : "";
}

function accessIdentityEmail(request: Request) {
  const headerEmail = request.headers.get("cf-access-authenticated-user-email") ?? request.headers.get("oai-authenticated-user-email");
  if (headerEmail) return headerEmail.trim();
  const payload = request.headers.get("cf-access-jwt-assertion")?.split(".")[1];
  if (!payload) return "";
  try { const claims = JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(payload.length / 4) * 4, "="))) as { email?: unknown }; return typeof claims.email === "string" ? claims.email.trim() : ""; } catch { return ""; }
}

function clean(value: string, max: number) { return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max); }
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS }); }
