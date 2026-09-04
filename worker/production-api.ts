import { PRODUCTION_CHURCHES } from "./generated/church-registry";
import { generateCanonicalSermonAnalysis, type CanonicalSermonAnalysis, type NormalizedTeachingSource, type TeachingSourceType } from "./sermon-analysis";
import { injectBsbScripture, resolveBsbPassage } from "./scripture-service";
import { extractTeachingSourceText, MAX_TOTAL_SUPPLEMENTAL_CHARACTERS } from "./teaching-source-extraction";

type ProductionEnv = {
  ASSETS?: Fetcher;
  BUCKET?: R2Bucket;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  PUBLIC_SITE_ORIGIN?: string;
  APPROVAL_ADMIN_EMAIL?: string;
  APPROVAL_REVIEWER_EMAIL?: string;
};

type ChurchConfig = {
  slug: string;
  name: string;
  resources: Array<"monday" | "group" | "family">;
  baseCssUrl: string;
  cssUrl: string;
  logoUrl?: string;
  reviewerEmail?: string;
};

type GeneratedPackage = {
  metadata: {
    sermonTitle: string;
    seriesTitle: string;
    scripture: string;
    speaker: string;
    confidence: "high" | "medium" | "low";
  };
  resources: { monday?: string; group?: string; family?: string };
};

type ProductionManifest = {
  id: string;
  churchSlug: string;
  churchName: string;
  weekOf: string;
  createdAt: string;
  status: "ready_for_internal_review" | "sent_for_approval";
  sourceFilename: string;
  sourceFiles?: Array<{
    sourceId: string;
    sourceType: TeachingSourceType;
    filename: string;
    storageKey: string;
    normalizedStorageKey?: string;
    characterCount?: number;
    warnings?: string[];
    status: "analyzed" | "extracted" | "extracted_with_warnings";
  }>;
  metadataOverrides?: { speaker?: string; sermonTitle?: string; seriesTitle?: string; primaryPassage?: string };
  analysisStorageKey?: string;
  analysisId?: string;
  fidelityResult?: string;
  metadata: GeneratedPackage["metadata"];
  resources: Array<{ kind: string; title: string; storageKey: string; previewUrl: string }>;
  reviewUrl?: string;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const LEGACY_LOGO_FALLBACKS: Record<string, string> = {
  "sample-church": "/sample-church-logo.webp",
  "southside-baptist": "/resources/southside-baptist/2026-08-09/southside-baptist-logo.png",
};
const CHURCHES = PRODUCTION_CHURCHES as ChurchConfig[];

function effectiveReviewerEmail(church: ChurchConfig | undefined, env: ProductionEnv) {
  return church?.reviewerEmail || env.APPROVAL_REVIEWER_EMAIL || "brian@sundaymultiplied.com";
}

export async function handleProductionApi(request: Request, env: ProductionEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const previewMatch = url.pathname.match(/^\/api\/production\/preview\/([^/]+)\/(monday|group|family)$/);
  const logoMatch = url.pathname.match(/^\/api\/resource-assets\/([a-z0-9]+(?:-[a-z0-9]+)*)\/logo$/);

  if (logoMatch && request.method === "GET") return serveChurchLogo(request, env, logoMatch[1]);

  if (url.pathname.startsWith("/api/production/") && !previewMatch) {
    const authError = adminAuthorizationError(request, env);
    if (authError) return json({ error: authError }, 401);
  }

  if (url.pathname === "/api/production/churches" && request.method === "GET") {
    return json({ churches: CHURCHES.map((church) => ({ ...church, reviewerEmail: effectiveReviewerEmail(church, env) })) });
  }

  if (url.pathname === "/api/production/jobs" && request.method === "GET") {
    if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
    const listed = await env.BUCKET.list({ prefix: "production/manifests/", limit: 50 });
    const manifests: ProductionManifest[] = [];
    for (const object of listed.objects) {
      const stored = await env.BUCKET.get(object.key);
      if (!stored) continue;
      try { manifests.push(await stored.json<ProductionManifest>()); } catch { /* ignore malformed manifests */ }
    }
    manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ jobs: manifests });
  }

  if (url.pathname === "/api/production/jobs" && request.method === "POST") {
    return createProductionJob(request, env);
  }

  if (previewMatch && request.method === "GET") {
    if (!env.BUCKET) return new Response("Production storage is not configured.", { status: 503 });
    const object = await env.BUCKET.get(`production/jobs/${previewMatch[1]}/${previewMatch[2]}.html`);
    if (!object) return new Response("Resource not found.", { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex, nofollow, noarchive",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'",
      },
    });
  }

  const sendMatch = url.pathname.match(/^\/api\/production\/jobs\/([^/]+)\/send$/);
  if (sendMatch && request.method === "POST") {
    if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
    const manifest = await loadManifest(env.BUCKET, sendMatch[1]);
    if (!manifest) return json({ error: "Production job not found." }, 404);
    if (manifest.status === "sent_for_approval" && manifest.reviewUrl) return json({ ok: true, reviewUrl: manifest.reviewUrl });
    const church = CHURCHES.find((item) => item.slug === manifest.churchSlug);
    const reviewerEmail = effectiveReviewerEmail(church, env);

    const response = await fetch(new URL("/api/approvals", request.url), {
      method: "POST",
      headers: forwardAdminHeaders(request.headers),
      body: JSON.stringify({
        churchName: manifest.churchName,
        churchSlug: manifest.churchSlug,
        title: manifest.metadata.sermonTitle || `${manifest.churchName} sermon resources`,
        seriesTitle: manifest.metadata.seriesTitle,
        weekOf: manifest.weekOf,
        scripture: manifest.metadata.scripture,
        reviewerEmail,
        resources: manifest.resources.map((item) => ({ kind: item.kind, title: item.title, previewUrl: item.previewUrl })),
      }),
    });
    const data = await response.json() as { error?: string; reviewUrl?: string };
    if (!response.ok) return json({ error: data.error || "Unable to send this package for approval." }, response.status);
    manifest.status = "sent_for_approval";
    manifest.reviewUrl = data.reviewUrl;
    await saveManifest(env.BUCKET, manifest);
    return json({ ok: true, reviewUrl: manifest.reviewUrl });
  }

  return null;
}

async function createProductionJob(request: Request, env: ProductionEnv) {
  if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
  if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured for production generation." }, 503);

  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: "Invalid sermon upload." }, 400); }
  const churchSlug = clean(String(form.get("churchSlug") || ""), 120);
  const weekOf = clean(String(form.get("weekOf") || ""), 10);
  const file = form.get("transcript");
  const church = CHURCHES.find((item) => item.slug === churchSlug);
  if (!church) return json({ error: "Choose a configured church." }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) return json({ error: "Choose a valid sermon date." }, 400);
  if (!(file instanceof File)) return json({ error: "Upload a TXT or VTT sermon transcript." }, 400);
  if (!/\.(txt|vtt)$/i.test(file.name)) return json({ error: "Transcript must be a .txt or .vtt file." }, 400);
  if (file.size > 5_000_000) return json({ error: "Transcript is too large. Maximum upload is 5 MB." }, 413);
  const transcriptFilename = clean(file.name, 180);

  const supplementalFieldTypes = [
    ["pastorNotes", "pastor_notes"],
    ["sermonManuscript", "sermon_manuscript"],
    ["outline", "outline"],
    ["supportingDocuments", "supporting_document"],
  ] as const;
  const supplementalUploads: Array<{ file: File; sourceType: TeachingSourceType }> = [];
  for (const [field, sourceType] of supplementalFieldTypes) {
    for (const value of form.getAll(field)) {
      if (!(value instanceof File) || value.size === 0) continue;
      if (!/\.(txt|docx|pdf)$/i.test(value.name)) return json({ error: `${clean(value.name, 180)} must be a TXT, DOCX, or PDF file.` }, 400);
      if (value.size > 10_000_000) return json({ error: `${clean(value.name, 180)} is too large. Maximum supplemental file size is 10 MB.` }, 413);
      supplementalUploads.push({ file: value, sourceType });
    }
  }
  if (supplementalUploads.length > 8) return json({ error: "Upload no more than 8 supplemental teaching-source files." }, 400);
  if (supplementalUploads.reduce((total, item) => total + item.file.size, 0) > 25_000_000) return json({ error: "Supplemental teaching sources exceed the 25 MB combined limit." }, 413);

  const metadataOverrides = {
    speaker: optionalClean(form.get("speaker"), 160),
    sermonTitle: optionalClean(form.get("sermonTitle"), 240),
    seriesTitle: optionalClean(form.get("seriesTitle"), 240),
    primaryPassage: optionalClean(form.get("primaryPassage"), 160),
  };

  const transcript = normalizeTranscript(await file.text(), transcriptFilename);
  if (transcript.length < 500) return json({ error: "The transcript is too short to generate reliable resources." }, 400);

  const id = crypto.randomUUID();
  const transcriptKey = `production/jobs/${id}/transcript.txt`;
  const analysisKey = `production/jobs/${id}/sermon-analysis.json`;
  await env.BUCKET.put(transcriptKey, transcript, { httpMetadata: { contentType: "text/plain; charset=utf-8" } });
  const supplementalSources: NormalizedTeachingSource[] = [];
  const storedSourceFiles: NonNullable<ProductionManifest["sourceFiles"]> = [{ sourceId: `transcript-${id}`, sourceType: "transcript", filename: transcriptFilename, storageKey: transcriptKey, status: "analyzed" }];
  let totalSupplementalCharacters = 0;
  for (const [index, upload] of supplementalUploads.entries()) {
    const bytes = await upload.file.arrayBuffer();
    const sourceFilename = clean(upload.file.name, 180);
    const sourceId = `${upload.sourceType}-${id}-${index + 1}`;
    const storageKey = `production/jobs/${id}/sources/${sourceId}/${safeStorageName(sourceFilename)}`;
    const normalizedStorageKey = `production/jobs/${id}/sources/${sourceId}/normalized.txt`;
    const mediaType = upload.file.type || mediaTypeForFilename(sourceFilename);
    let extraction: Awaited<ReturnType<typeof extractTeachingSourceText>>;
    try {
      extraction = await extractTeachingSourceText(sourceFilename, bytes);
    } catch (error) {
      console.error("teaching_source_extraction_failed", { sourceId, sourceFilename, error });
      return json({
        error: error instanceof Error ? clean(error.message, 500) : `${sourceFilename} could not be converted to readable text.`,
        jobId: id,
        sourceId,
      }, 422);
    }
    totalSupplementalCharacters += extraction.text.length;
    if (totalSupplementalCharacters > MAX_TOTAL_SUPPLEMENTAL_CHARACTERS) {
      return json({
        error: `The supporting files contain more than ${MAX_TOTAL_SUPPLEMENTAL_CHARACTERS.toLocaleString("en-US")} extracted characters combined. Remove or shorten a source and try again.`,
        jobId: id,
      }, 413);
    }
    await env.BUCKET.put(storageKey, bytes, { httpMetadata: { contentType: mediaType } });
    await env.BUCKET.put(normalizedStorageKey, extraction.text, { httpMetadata: { contentType: "text/plain; charset=utf-8" } });
    supplementalSources.push({
      descriptor: {
        source_id: sourceId,
        source_type: upload.sourceType,
        name: sourceFilename,
        media_type: mediaType,
        sha256: await sha256Hex(bytes),
        role: "supporting",
        authorized_use: "May clarify transcript-supported structure, wording, references, and probable transcription errors; may not override or independently establish delivered sermon content.",
      },
      text: extraction.text,
    });
    storedSourceFiles.push({
      sourceId,
      sourceType: upload.sourceType,
      filename: sourceFilename,
      storageKey,
      normalizedStorageKey,
      characterCount: extraction.text.length,
      warnings: extraction.warnings,
      status: extraction.warnings.length ? "extracted_with_warnings" : "extracted",
    });
  }

  let analysis: CanonicalSermonAnalysis;
  try {
    analysis = await generateCanonicalSermonAnalysis(env, {
      jobId: id,
      churchSlug: church.slug,
      churchName: church.name,
      weekOf,
      sourceFilename: transcriptFilename,
      transcript,
      supplementalSources,
      metadataOverrides,
    });
    await env.BUCKET.put(analysisKey, JSON.stringify(analysis, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  } catch (error) {
    console.error("sermon_analysis_generation_failed", error);
    return json({ error: error instanceof Error ? clean(error.message, 500) : "Canonical sermon analysis failed.", jobId: id }, 502);
  }

  if (["blocked", "human_review_required"].includes(analysis.source_quality.generation_disposition)
      || ["fail", "human_review_required"].includes(analysis.fidelity_audit.result)) {
    return json({
      error: "The canonical sermon analysis requires human review before resources can be generated.",
      jobId: id,
      analysisStorageKey: analysisKey,
      fidelityResult: analysis.fidelity_audit.result,
      analysisNotes: analysis.fidelity_audit.notes,
    }, 422);
  }

  let generated: GeneratedPackage;
  try {
    generated = await generateResourcesFromAnalysis(env, church, weekOf, analysis);
  } catch (error) {
    console.error("sermon_resource_generation_failed", error);
    return json({ error: error instanceof Error ? clean(error.message, 500) : "Resource generation failed.", jobId: id, analysisStorageKey: analysisKey }, 502);
  }

  const needsFullScripture = church.resources.some((kind) => kind === "group" || kind === "family");
  let scripturePassage: Awaited<ReturnType<typeof resolveBsbPassage>> | undefined;
  if (needsFullScripture) {
    if (!generated.metadata.scripture) {
      return json({ error: "The canonical analysis did not establish a primary Scripture passage. Group and Family resources require an exact BSB passage before production can continue.", jobId: id, analysisStorageKey: analysisKey }, 422);
    }
    try {
      scripturePassage = await resolveBsbPassage(generated.metadata.scripture);
    } catch (error) {
      console.error("bsb_scripture_lookup_failed", error);
      return json({ error: error instanceof Error ? clean(error.message, 500) : "The BSB Scripture passage could not be loaded.", jobId: id }, 502);
    }
  }

  const origin = env.PUBLIC_SITE_ORIGIN || new URL(request.url).origin;
  const resources: ProductionManifest["resources"] = [];
  for (const kind of church.resources) {
    const generatedHtml = generated.resources[kind];
    if (!generatedHtml) continue;
    let html = enforceResourceStyling(generatedHtml, church, kind);
    if (scripturePassage && (kind === "group" || kind === "family")) {
      try { html = injectBsbScripture(html, scripturePassage); }
      catch (error) {
        console.error("bsb_scripture_injection_failed", error);
        return json({ error: error instanceof Error ? clean(error.message, 500) : "The exact BSB Scripture passage could not be inserted into the resource.", jobId: id }, 502);
      }
    }
    const storageKey = `production/jobs/${id}/${kind}.html`;
    await env.BUCKET.put(storageKey, html, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
    resources.push({ kind: titleCase(kind), title: `${titleCase(kind)} Multiplied`, storageKey, previewUrl: `${origin}/api/production/preview/${id}/${kind}` });
  }
  if (!resources.length) return json({ error: "No resources were generated.", jobId: id }, 502);

  const manifest: ProductionManifest = {
    id,
    churchSlug: church.slug,
    churchName: church.name,
    weekOf,
    createdAt: new Date().toISOString(),
    status: "ready_for_internal_review",
    sourceFilename: transcriptFilename,
    sourceFiles: storedSourceFiles,
    metadataOverrides,
    analysisStorageKey: analysisKey,
    analysisId: analysis.analysis_id,
    fidelityResult: analysis.fidelity_audit.result,
    metadata: generated.metadata,
    resources,
  };
  await saveManifest(env.BUCKET, manifest);
  return json({ ok: true, job: manifest }, 201);
}

async function serveChurchLogo(request: Request, env: ProductionEnv, slug: string) {
  if (env.BUCKET) {
    const object = await env.BUCKET.get(`resource-assets/${slug}/primary`);
    if (object) {
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      if (!headers.get("content-type")) headers.set("content-type", "application/octet-stream");
      headers.set("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
      headers.set("x-content-type-options", "nosniff");
      return new Response(object.body, { headers });
    }
  }
  const fallback = LEGACY_LOGO_FALLBACKS[slug];
  if (!fallback || !env.ASSETS) return new Response("Logo not found.", { status: 404 });
  const response = await env.ASSETS.fetch(new Request(new URL(fallback, request.url), { headers: { accept: "image/*" } }));
  if (!response.ok) return new Response("Logo not found.", { status: 404 });
  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
  headers.set("x-content-type-options", "nosniff");
  return new Response(response.body, { status: response.status, headers });
}

async function generateResourcesFromAnalysis(env: ProductionEnv, church: ChurchConfig, weekOf: string, analysis: CanonicalSermonAnalysis): Promise<GeneratedPackage> {
  const resourceList = church.resources.join(", ");
  const metadata: GeneratedPackage["metadata"] = {
    sermonTitle: analysis.sermon.sermon_title || "",
    seriesTitle: analysis.sermon.series_title || "",
    scripture: analysis.sermon.primary_passage || "",
    speaker: analysis.sermon.speaker || "",
    confidence: analysis.source_quality.overall,
  };
  const prompt = `You are the Sunday Multiplied resource production engine. Create production-ready discipleship resources from the APPROVED CANONICAL SERMON ANALYSIS below.

AUTHORITY ORDER
1. Sunday Multiplied Sermon Fidelity Standard v1.0.
2. The supplied transcript-led Canonical Sermon Analysis v3.
3. The resource format requirements below.

The analysis is the governing evidence map. The delivered-sermon transcript controls whenever it is available. Do not add sermon claims, theology, quotations, applications, illustrations, references, or pastoral intent that are not supported there. Never use source_comparison.notes_only_content in a resource. Follow memorable_structure only when use_in_resources is true. Prefer Pastor Language Bank wording that is verified by transcript evidence. Preserve qualifications. Represent the sermon's complete major-movement arc rather than narrowing everything to one attractive theme. Use only applications classified explicit or supported and stay inside adaptation_boundaries.

Generate these resources: ${resourceList}.
Church: ${church.name}.
Sermon date: ${weekOf}.
Shared CSS: ${church.baseCssUrl}.
Church CSS: ${church.cssUrl}.
Church logo: ${church.logoUrl || "none"}.
Primary Scripture: ${metadata.scripture || "not established"}.

CONTENT REQUIREMENTS
- Monday: concise sermon recap preserving the whole arc, 2-3 distinct supported takeaways, one reflection question, short sermon-rooted prayer. Scripture reference only.
- Group: Big Idea, Tension, Sermon Snapshot, 3-5 Key Moments covering all major movements, 4-6 natural questions across Understand/Reflect/Apply, Practice This Week, Midweek Reinforcement, sermon-specific Leader Tip, Closing Prayer. Include exactly one Scripture section but do not write Scripture text; the system inserts exact BSB.
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

  const schema = {
    type: "object", additionalProperties: false,
    properties: {
      resources: { type: "object", additionalProperties: false, properties: { monday: { type: "string" }, group: { type: "string" }, family: { type: "string" } }, required: ["monday", "group", "family"] },
    },
    required: ["resources"],
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.6-terra",
      input: [
        { role: "system", content: [{ type: "input_text", text: prompt }] },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify(analysis) }] },
      ],
      text: { format: { type: "json_schema", name: "sunday_multiplied_resources", strict: true, schema } },
    }),
  });
  const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || "Resource generation failed.");
  const outputText = data.output_text || extractOutputText(data.output);
  if (!outputText) throw new Error("Resource generation returned no output.");
  const parsed = JSON.parse(outputText) as { resources: GeneratedPackage["resources"] };
  return { metadata, resources: parsed.resources };
}

function enforceResourceStyling(input: string, church: ChurchConfig, kind: "monday" | "group" | "family") {
  let html = input.trim();
  const stylesheetLinks = `<link rel="stylesheet" href="${church.baseCssUrl}">\n<link rel="stylesheet" href="${church.cssUrl}">`;
  html = html.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>\s*/gi, "");
  if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${stylesheetLinks}\n</head>`);
  html = html.replace(/<body\b([^>]*)>/i, (_match, attrs: string) => {
    const classMatch = attrs.match(/class=["']([^"']*)["']/i);
    const classes = new Set((classMatch?.[1] || "").split(/\s+/).filter(Boolean));
    classes.add("sm-resource"); classes.add(`sm-${kind}`);
    const nextClass = `class="${[...classes].join(" ")}"`;
    return classMatch ? `<body${attrs.replace(classMatch[0], nextClass)}>` : `<body${attrs} ${nextClass}>`;
  });
  return html;
}

function extractOutputText(output: Array<{ content?: Array<{ type?: string; text?: string }> }> | undefined) {
  return (output || []).flatMap((item) => item.content || []).filter((item) => item.type === "output_text" && typeof item.text === "string").map((item) => item.text || "").join("");
}

function normalizeTranscript(input: string, filename: string) {
  let text = input.replace(/^\uFEFF/, "").replace(/\r/g, "");
  if (/\.vtt$/i.test(filename)) {
    text = text.split("\n")
      .filter((line) => line.trim() && !/^WEBVTT/i.test(line) && !/^NOTE\b/i.test(line) && !/^\d+$/.test(line.trim()) && !/-->/.test(line))
      .map((line) => line.replace(/<[^>]+>/g, "").trim())
      .filter(Boolean)
      .filter((line, index, lines) => index === 0 || line !== lines[index - 1])
      .join("\n");
  }
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

async function saveManifest(bucket: R2Bucket, manifest: ProductionManifest) {
  await bucket.put(`production/manifests/${manifest.id}.json`, JSON.stringify(manifest, null, 2), { httpMetadata: { contentType: "application/json" } });
}
async function loadManifest(bucket: R2Bucket, id: string) {
  const object = await bucket.get(`production/manifests/${id}.json`);
  if (!object) return null;
  try { return await object.json<ProductionManifest>(); } catch { return null; }
}
function forwardAdminHeaders(headers: Headers) {
  const next = new Headers({ "content-type": "application/json" });
  for (const name of ["cf-access-authenticated-user-email", "oai-authenticated-user-email", "cf-access-jwt-assertion", "authorization", "cookie"]) {
    const value = headers.get(name); if (value) next.set(name, value);
  }
  return next;
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
  try {
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(base64)) as { email?: unknown };
    return typeof claims.email === "string" ? claims.email.trim() : "";
  } catch { return ""; }
}
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function clean(value: string, max: number) { return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max); }
function optionalClean(value: FormDataEntryValue | null, max: number) {
  if (typeof value !== "string") return undefined;
  return clean(value, max) || undefined;
}
function safeStorageName(value: string) {
  const cleaned = value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);
  return cleaned || "source-file";
}
function mediaTypeForFilename(value: string) {
  if (/\.pdf$/i.test(value)) return "application/pdf";
  if (/\.docx$/i.test(value)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "text/plain; charset=utf-8";
}
async function sha256Hex(value: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
