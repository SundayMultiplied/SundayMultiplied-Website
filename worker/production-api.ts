import { PRODUCTION_CHURCHES } from "./generated/church-registry";
import { generateCanonicalSermonAnalysis, type CanonicalSermonAnalysis, type NormalizedTeachingSource, type TeachingSourceType } from "./sermon-analysis";
import { injectBsbScripture, resolveBsbPassage, type ScripturePreferences } from "./scripture-service";
import { extractTeachingSourceText, MAX_TOTAL_SUPPLEMENTAL_CHARACTERS } from "./teaching-source-extraction";
import { loadAnalysisReviewFeedback } from "./analysis-review-api";
import {
  injectWorshipSongUrl,
  resolveFamilyWorshipPreferences,
  validateFamilyV3Html,
  worshipPlatformLabel,
  type FamilyWorshipPreferences,
  type FamilyWorshipSong,
} from "./family-resource";
import { callOpenAiStructured } from "./openai-client.ts";
import { injectResourceHeaderMetadata } from "./resource-metadata.ts";

export type ProductionEnv = {
  ASSETS?: Fetcher;
  BUCKET?: R2Bucket;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  PUBLIC_SITE_ORIGIN?: string;
  APPROVAL_ADMIN_EMAIL?: string;
  APPROVAL_REVIEWER_EMAIL?: string;
};

export type ChurchConfig = {
  slug: string;
  name: string;
  resources: Array<"monday" | "group" | "family">;
  baseCssUrl: string;
  cssUrl: string;
  logoUrl?: string;
  reviewerEmail?: string;
  familyWorship?: FamilyWorshipPreferences;
  scripture?: ScripturePreferences;
};

export type GeneratedPackage = {
  metadata: {
    sermonTitle: string;
    seriesTitle: string;
    scripture: string;
    speaker: string;
    confidence: "high" | "medium" | "low";
  };
  resources: { monday?: string; group?: string; family?: string };
  familyWorshipSong?: FamilyWorshipSong;
};

export type ProductionManifest = {
  id: string;
  churchSlug: string;
  churchName: string;
  weekOf: string;
  createdAt: string;
  status: "awaiting_analysis_review" | "ready_for_internal_review" | "sent_for_approval";
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
  familyWorship?: FamilyWorshipPreferences;
  analysisStorageKey?: string;
  analysisId?: string;
  fidelityResult?: string;
  analysisAcceptedAt?: string;
  analysisAcceptedBy?: string;
  analysisAttempt?: number;
  analysisLastGeneratedAt?: string;
  analysisReviewId?: string;
  analysisReviewUrl?: string;
  metadata: GeneratedPackage["metadata"];
  resources: Array<{ kind: string; title: string; storageKey: string; previewUrl: string }>;
  reviewPackageId?: string;
  reviewUrl?: string;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const LEGACY_LOGO_FALLBACKS: Record<string, string> = {
  "sample-church": "/sample-church-logo.webp",
  "southside-baptist": "/resources/southside-baptist/2026-08-09/southside-baptist-logo.png",
};
export const CHURCHES = PRODUCTION_CHURCHES as ChurchConfig[];

function effectiveReviewerEmail(church: ChurchConfig | undefined, env: ProductionEnv) {
  return church?.reviewerEmail || env.APPROVAL_REVIEWER_EMAIL || "brian@sundaymultiplied.com";
}

export async function handleProductionApi(request: Request, env: ProductionEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const previewMatch = url.pathname.match(/^\/api\/production\/preview\/([^/]+)\/(monday|group|family)$/);
  const analysisMatch = url.pathname.match(/^\/api\/production\/jobs\/([^/]+)\/analysis$/);
  const analysisRetryMatch = url.pathname.match(/^\/api\/production\/jobs\/([^/]+)\/analysis\/retry$/);
  const generateMatch = url.pathname.match(/^\/api\/production\/jobs\/([^/]+)\/generate$/);
  const sourceMatch = url.pathname.match(/^\/api\/production\/jobs\/([^/]+)\/sources\/([^/]+)$/);
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

  if (analysisMatch && request.method === "GET") {
    if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
    const manifest = await loadManifest(env.BUCKET, analysisMatch[1]);
    if (!manifest) return json({ error: "Production job not found." }, 404);
    const analysis = await loadAnalysis(env.BUCKET, manifest);
    if (!analysis) return json({ error: "Sermon analysis is unavailable for this production job." }, 404);
    return json({ analysis, analysisReviewUrl: manifest.analysisReviewUrl || "", feedback: await loadAnalysisReviewFeedback(env.BUCKET, manifest.analysisReviewId) });
  }

  if (analysisRetryMatch && request.method === "POST") return retryProductionJobAnalysis(request, env, analysisRetryMatch[1]);

  if (sourceMatch && (request.method === "GET" || request.method === "HEAD")) {
    if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
    const manifest = await loadManifest(env.BUCKET, sourceMatch[1]);
    if (!manifest) return json({ error: "Production job not found." }, 404);
    const source = manifest.sourceFiles?.find((item) => item.sourceId === sourceMatch[2]);
    if (!source) return json({ error: "Teaching source not found." }, 404);
    const sourceMetadata = await env.BUCKET.head(source.storageKey);
    if (!sourceMetadata) return json({ error: "Teaching source file is unavailable." }, 404);
    if (sourceMetadata.size === 0 && source.normalizedStorageKey) {
      const normalized = await env.BUCKET.get(source.normalizedStorageKey);
      if (normalized) return serveExtractedSourceFallback(request, normalized, source.filename);
    }
    const rangeHeader = request.headers.get("range");
    const object = await env.BUCKET.get(source.storageKey, rangeHeader ? { range: request.headers } : undefined);
    if (!object) return json({ error: "Teaching source file is unavailable." }, 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", mediaTypeForFilename(source.filename));
    headers.set("content-disposition", sourceContentDisposition(source.filename));
    headers.set("cache-control", "private, no-store");
    headers.set("accept-ranges", "bytes");
    headers.set("etag", object.httpEtag);
    headers.set("x-content-type-options", "nosniff");
    headers.set("x-robots-tag", "noindex, nofollow, noarchive");
    const range = object.range;
    const isPartial = rangeHeader && range && typeof range.offset === "number" && typeof range.length === "number";
    if (isPartial) {
      headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
      headers.set("content-length", String(range.length));
    } else {
      headers.set("content-length", String(object.size));
    }
    return new Response(request.method === "HEAD" ? null : object.body, { status: isPartial ? 206 : 200, headers });
  }

  if (generateMatch && request.method === "POST") {
    return generateProductionJobResources(request, env, generateMatch[1]);
  }

  if (previewMatch && request.method === "GET") {
    if (!env.BUCKET) return new Response("Production storage is not configured.", { status: 503 });
    const object = await env.BUCKET.get(`production/jobs/${previewMatch[1]}/${previewMatch[2]}.html`);
    if (!object) return new Response("Resource not found.", { status: 404 });
    let body: ReadableStream | string = object.body;
    const manifest = await loadManifest(env.BUCKET, previewMatch[1]);
    if (manifest) {
      body = injectResourceHeaderMetadata(await object.text(), manifest.metadata, manifest.weekOf);
    }
    return new Response(body, {
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
    if (manifest.status === "awaiting_analysis_review" || !manifest.resources.length) {
      return json({ error: "Accept the sermon analysis and generate resources before sending this package for approval." }, 409);
    }
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
    const data = await response.json() as { error?: string; packageId?: string; reviewUrl?: string };
    if (!response.ok) return json({ error: data.error || "Unable to send this package for approval." }, response.status);
    manifest.status = "sent_for_approval";
    manifest.reviewPackageId = data.packageId;
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
  const familyWorship = resolveFamilyWorshipPreferences(
    church.familyWorship,
    optionalClean(form.get("familyWorshipStyle"), 40),
    optionalClean(form.get("familyWorshipPlatform"), 40),
  );

  const transcriptBytes = await file.arrayBuffer();
  const transcript = normalizeTranscript(new TextDecoder().decode(transcriptBytes), transcriptFilename);
  if (transcript.length < 500) return json({ error: "The transcript is too short to generate reliable resources." }, 400);

  const id = crypto.randomUUID();
  const transcriptSourceId = `transcript-${id}`;
  const transcriptKey = `production/jobs/${id}/sources/${transcriptSourceId}/${safeStorageName(transcriptFilename)}`;
  const analysisKey = `production/jobs/${id}/sermon-analysis.json`;
  await env.BUCKET.put(transcriptKey, transcriptBytes, { httpMetadata: { contentType: mediaTypeForFilename(transcriptFilename) } });
  const supplementalSources: NormalizedTeachingSource[] = [];
  const storedSourceFiles: NonNullable<ProductionManifest["sourceFiles"]> = [{ sourceId: transcriptSourceId, sourceType: "transcript", filename: transcriptFilename, storageKey: transcriptKey, status: "analyzed" }];
  let totalSupplementalCharacters = 0;
  for (const [index, upload] of supplementalUploads.entries()) {
    const bytes = await upload.file.arrayBuffer();
    const sourceFilename = clean(upload.file.name, 180);
    const sourceId = `${upload.sourceType}-${id}-${index + 1}`;
    const storageKey = `production/jobs/${id}/sources/${sourceId}/${safeStorageName(sourceFilename)}`;
    const normalizedStorageKey = `production/jobs/${id}/sources/${sourceId}/normalized.txt`;
    const mediaType = upload.file.type || mediaTypeForFilename(sourceFilename);
    await env.BUCKET.put(storageKey, bytes, { httpMetadata: { contentType: mediaType } });
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

  const manifest: ProductionManifest = {
    id,
    churchSlug: church.slug,
    churchName: church.name,
    weekOf,
    createdAt: new Date().toISOString(),
    status: "awaiting_analysis_review",
    sourceFilename: transcriptFilename,
    sourceFiles: storedSourceFiles,
    metadataOverrides,
    familyWorship,
    analysisStorageKey: analysisKey,
    analysisId: analysis.analysis_id,
    fidelityResult: analysis.fidelity_audit.result,
    analysisAttempt: 1,
    analysisLastGeneratedAt: new Date().toISOString(),
    metadata: metadataFromAnalysis(analysis),
    resources: [],
  };
  await saveManifest(env.BUCKET, manifest);
  return json({ ok: true, job: manifest }, 201);
}

async function retryProductionJobAnalysis(request: Request, env: ProductionEnv, jobId: string) {
  if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
  if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured for sermon analysis." }, 503);
  const manifest = await loadManifest(env.BUCKET, jobId);
  if (!manifest) return json({ error: "Production job not found." }, 404);
  if (manifest.status !== "awaiting_analysis_review") {
    return json({ error: "Analysis can only be retried before resources are generated." }, 409);
  }
  const currentAnalysis = await loadAnalysis(env.BUCKET, manifest);
  if (!currentAnalysis) return json({ error: "The current sermon analysis is unavailable." }, 404);
  const transcriptFile = manifest.sourceFiles?.find((source) => source.sourceType === "transcript");
  if (!transcriptFile) return json({ error: "The saved sermon transcript is unavailable." }, 404);
  const transcriptObject = await env.BUCKET.get(transcriptFile.storageKey);
  if (!transcriptObject) return json({ error: "The saved sermon transcript is unavailable." }, 404);
  const transcript = normalizeTranscript(await new Response(transcriptObject.body).text(), transcriptFile.filename);
  const supplementalSources: NormalizedTeachingSource[] = [];
  for (const source of manifest.sourceFiles?.filter((item) => item.sourceType !== "transcript") || []) {
    const descriptor = currentAnalysis.source_bundle.supplemental_sources.find((item) => item.source_id === source.sourceId);
    if (!descriptor || !source.normalizedStorageKey) continue;
    const normalizedObject = await env.BUCKET.get(source.normalizedStorageKey);
    if (!normalizedObject) continue;
    supplementalSources.push({ descriptor, text: await new Response(normalizedObject.body).text() });
  }
  let analysis: CanonicalSermonAnalysis;
  try {
    analysis = await generateCanonicalSermonAnalysis(env, {
      jobId: manifest.id,
      churchSlug: manifest.churchSlug,
      churchName: manifest.churchName,
      weekOf: manifest.weekOf,
      sourceFilename: manifest.sourceFilename,
      transcript,
      supplementalSources,
      metadataOverrides: manifest.metadataOverrides || {},
    });
  } catch (error) {
    console.error("sermon_analysis_retry_failed", { jobId, error });
    return json({ error: error instanceof Error ? clean(error.message, 500) : "Sermon analysis retry failed." }, 502);
  }
  if (manifest.analysisReviewId) {
    await env.BUCKET.delete(`production/analysis-review-manifests/${manifest.analysisReviewId}.json`);
    await deleteR2Prefix(env.BUCKET, `production/analysis-reviews/${manifest.analysisReviewId}/`);
  }
  await env.BUCKET.put(manifest.analysisStorageKey || `production/jobs/${jobId}/sermon-analysis.json`, JSON.stringify(analysis, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  manifest.analysisStorageKey ||= `production/jobs/${jobId}/sermon-analysis.json`;
  manifest.analysisId = analysis.analysis_id;
  manifest.fidelityResult = analysis.fidelity_audit.result;
  manifest.metadata = metadataFromAnalysis(analysis);
  manifest.analysisAttempt = (manifest.analysisAttempt || 1) + 1;
  manifest.analysisLastGeneratedAt = new Date().toISOString();
  delete manifest.analysisReviewId;
  delete manifest.analysisReviewUrl;
  await saveManifest(env.BUCKET, manifest);
  return json({ ok: true, job: manifest, analysis, analysisReviewUrl: "", feedback: [] });
}

async function generateProductionJobResources(request: Request, env: ProductionEnv, jobId: string) {
  if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
  if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured for production generation." }, 503);
  const manifest = await loadManifest(env.BUCKET, jobId);
  if (!manifest) return json({ error: "Production job not found." }, 404);
  if (manifest.status === "sent_for_approval") return json({ error: "This package has already been sent for approval." }, 409);
  if (manifest.status === "ready_for_internal_review" && manifest.resources.length) return json({ ok: true, job: manifest });

  const analysis = await loadAnalysis(env.BUCKET, manifest);
  if (!analysis) return json({ error: "Sermon analysis is unavailable for this production job." }, 404);
  if (analysis.source_quality.generation_disposition === "blocked" || analysis.fidelity_audit.result === "fail") {
    return json({ error: "This analysis is blocked. Correct the teaching sources and create a new analysis before generating resources." }, 422);
  }
  const church = CHURCHES.find((item) => item.slug === manifest.churchSlug);
  if (!church) return json({ error: "The church configuration for this production job is unavailable." }, 409);

  let generated: GeneratedPackage;
  try {
    generated = await generateResourcesFromAnalysis(env, church, manifest.weekOf, analysis, manifest.familyWorship);
  } catch (error) {
    console.error("sermon_resource_generation_failed", error);
    return json({ error: error instanceof Error ? clean(error.message, 500) : "Resource generation failed.", jobId }, 502);
  }

  const needsFullScripture = church.resources.some((kind) => kind === "group" || kind === "family");
  let scripturePassage: Awaited<ReturnType<typeof resolveBsbPassage>> | undefined;
  if (needsFullScripture) {
    if (!generated.metadata.scripture) {
      return json({ error: "The analysis did not establish a primary Scripture passage. Add a passage override and create a new analysis before generating Group or Family resources.", jobId }, 422);
    }
    try {
      scripturePassage = await resolveBsbPassage(generated.metadata.scripture);
    } catch (error) {
      console.error("bsb_scripture_lookup_failed", error);
      return json({ error: error instanceof Error ? clean(error.message, 500) : "The BSB Scripture passage could not be loaded.", jobId }, 502);
    }
  }

  const origin = env.PUBLIC_SITE_ORIGIN || new URL(request.url).origin;
  try {
    const preparedResources: Array<{ kind: "monday" | "group" | "family"; html: string }> = [];
    for (const kind of church.resources) {
      const generatedHtml = generated.resources[kind];
      if (!generatedHtml) continue;
      let html = enforceResourceStyling(generatedHtml, church, kind);
      if (kind === "family") {
        const preferences = resolveFamilyWorshipPreferences(church.familyWorship, manifest.familyWorship?.style, manifest.familyWorship?.platform);
        validateFamilyV3Html(html, preferences);
        if (generated.familyWorshipSong) html = injectWorshipSongUrl(html, generated.familyWorshipSong, preferences);
      }
      if (scripturePassage && (kind === "group" || kind === "family")) html = injectBsbScripture(html, scripturePassage, church.scripture);
      preparedResources.push({ kind, html });
    }

    const resources: ProductionManifest["resources"] = [];
    for (const resource of preparedResources) {
      const storageKey = `production/jobs/${jobId}/${resource.kind}.html`;
      await env.BUCKET.put(storageKey, resource.html, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
      resources.push({ kind: titleCase(resource.kind), title: `${titleCase(resource.kind)} Multiplied`, storageKey, previewUrl: `${origin}/api/production/preview/${jobId}/${resource.kind}` });
    }
    if (!resources.length) return json({ error: "No resources were generated.", jobId }, 502);

    manifest.status = "ready_for_internal_review";
    manifest.analysisAcceptedAt = new Date().toISOString();
    manifest.analysisAcceptedBy = accessIdentityEmail(request);
    manifest.metadata = generated.metadata;
    manifest.resources = resources;
    await saveManifest(env.BUCKET, manifest);
    return json({ ok: true, job: manifest });
  } catch (error) {
    console.error("sermon_resource_finalization_failed", { jobId, error });
    return json({ error: error instanceof Error ? clean(error.message, 500) : "Generated resources could not be validated and saved.", jobId }, 502);
  }
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

export async function generateResourcesFromAnalysis(env: ProductionEnv, church: ChurchConfig, weekOf: string, analysis: CanonicalSermonAnalysis, familyWorshipOverride?: FamilyWorshipPreferences): Promise<GeneratedPackage> {
  const resourceList = church.resources.join(", ");
  const familyWorship = resolveFamilyWorshipPreferences(church.familyWorship, familyWorshipOverride?.style, familyWorshipOverride?.platform);
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

VOICE AND HUMANITY
- Use pastoral_voice_profile to shape expression, warmth, pacing, application posture, and question style when it is present.
- Write as a thoughtful pastor pressing the sermon into ordinary life: personal, grounded, gracious, and direct rather than academic, clinical, or textbook-like.
- The voice profile may influence HOW supported content is communicated; it may never add WHAT the pastor did not say.
- Do not impersonate the pastor, manufacture quotations, overuse signature phrases, or turn observed traits into caricature.

Generate these resources: ${resourceList}.
Church: ${church.name}.
Sermon date: ${weekOf}.
Shared CSS: ${church.baseCssUrl}.
Church CSS: ${church.cssUrl}.
Church logo: ${church.logoUrl || "none"}.
Primary Scripture: ${metadata.scripture || "not established"}.
Family worship preference: ${familyWorship.style}.
Family listening platform: ${worshipPlatformLabel(familyWorship.platform)}.

CONTENT REQUIREMENTS
- Monday: concise sermon recap preserving the whole arc, 2-3 distinct supported takeaways, one reflection question, short sermon-rooted prayer. Scripture reference only.
- Group: Big Idea, Tension, Sermon Snapshot, 3-5 Key Moments covering all major movements, 4-6 natural questions across Understand/Reflect/Apply, Practice This Week, sermon-specific Leader Tip, Closing Prayer. Include exactly one Scripture section but do not write Scripture text; the system inserts exact BSB. Do not include a Midweek Reinforcement section or assign the group leader a later follow-up message.
- Family: a self-contained 10-15 minute family discipleship experience. Assume children below high-school age did not attend or hear the Sunday sermon. Never ask them to remember what the pastor said. Give parents a concise 90-140 word sermon summary that clearly introduces the sermon's big idea and central response without requiring prior sermon knowledge.
- Family questions: include four clearly labeled age groups in this order: Pre-K & Kindergarten, Elementary, Middle School, High School. Give each group 1-2 questions with a strong, explicit connection to the sermon's supported big idea, image, tension, or application. Questions must be genuinely developmentally appropriate, not the same abstract question with simpler vocabulary. Pre-K/Kindergarten questions should be concrete and answerable through an everyday example, choice, feeling, or action. Elementary questions should connect the introduced idea to a familiar situation. Middle School questions should invite honest reflection about relationships, pressures, habits, or choices. High School questions may engage motives, beliefs, tensions, and concrete application. Keep every group understandable even if the child did not attend the sermon.
- Family flow: Parent Setup, Big Idea, Read Together, Choose Your Questions, Try It Together, Worship Together, Pray Together. Include exactly one Scripture section without passage text. The family practice must be supported by the analysis and usable by mixed ages.
- Family worship: ${familyWorship.style === "none" ? "omit the Worship Together section and return blank familyWorshipSong fields" : `recommend one ${familyWorship.style === "blended" ? "contemporary worship song or established hymn" : familyWorship.style === "hymn" ? "established hymn" : "contemporary Christian worship song"} that meaningfully reinforces the sermon's supported major theme. Favor a familiar congregational song over a merely topical song. Return its title, artist or commonly recognized version, and one-sentence sermon connection in familyWorshipSong. Do not quote lyrics. In the family HTML, include one link with class sm-worship-link, href exactly {{SM_WORSHIP_SONG_URL}}, target _blank, and rel noreferrer. Its visible label must be Play on ${worshipPlatformLabel(familyWorship.platform)}.`}
- Quotation marks may only be used for exact_quote or verified_short_phrase entries from the Pastor Language Bank.
- Do not create filler merely to hit a preferred count.

HTML CONTRACT
- Complete standalone HTML; no inline styles.
- Stylesheet links in order: ${church.baseCssUrl}, then ${church.cssUrl}.
- Body classes: sm-resource sm-monday|sm-group|sm-family.
- Wrapper: <main class="sm-document">.
- Header: sm-header sm-header--with-logo > sm-header-content with sm-header-text, sm-eyebrow sm-resource-label, sm-title, sm-meta. Logo in sm-header-logo-wrap with img sm-church-logo sm-logo using ${church.logoUrl || ""} when present.
- Every content section uses sm-section plus the appropriate established modifier: sm-section--scripture, --summary, --takeaways, --reflection, --big-idea, --tension, --key-moments, --questions, --application, --practice, --leader-tip, --parent-note, --family-remember, --family-questions, --worship, --prayer.
- Family age groups use article.sm-family-age-group and an h3 age label. Put each group's 1-2 questions in an ordered list so every question is one li element. The parent sermon summary uses sm-section--parent-note. The worship recommendation uses sm-worship-song, sm-worship-connection, and sm-worship-link.
- Group/Family include exactly one sm-section sm-section--scripture. Scripture reference uses sm-scripture-reference.
- Group question clusters use sm-question-group with Understand, Reflect, Apply headings.
- Practice may use sm-practice-scenario, sm-practice-task, sm-practice-share, sm-practice-debrief.
- Footer inside sm-document: <footer class="sm-footer"><p>Sunday Multiplied</p></footer>.

Return only the requested JSON structure.`;

  const schema = {
    type: "object", additionalProperties: false,
    properties: {
      resources: { type: "object", additionalProperties: false, properties: { monday: { type: "string" }, group: { type: "string" }, family: { type: "string" } }, required: ["monday", "group", "family"] },
      familyWorshipSong: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, artist: { type: "string" }, connection: { type: "string" } }, required: ["title", "artist", "connection"] },
    },
    required: ["resources", "familyWorshipSong"],
  };
  const parsed = await callOpenAiStructured<{ resources: GeneratedPackage["resources"]; familyWorshipSong: FamilyWorshipSong }>({
    apiKey: env.OPENAI_API_KEY,
    operation: "Resource generation",
    body: {
      model: env.OPENAI_MODEL || "gpt-5.6-terra",
      input: [
        { role: "system", content: [{ type: "input_text", text: prompt }] },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify(analysis) }] },
      ],
      text: { format: { type: "json_schema", name: "sunday_multiplied_resources", strict: true, schema } },
    },
  });
  const resources = Object.fromEntries(
    Object.entries(parsed.resources).map(([kind, html]) => [kind, html ? injectResourceHeaderMetadata(html, metadata, weekOf) : html]),
  ) as GeneratedPackage["resources"];
  return { metadata, resources, familyWorshipSong: parsed.familyWorshipSong };
}

export function enforceResourceStyling(input: string, church: ChurchConfig, kind: "monday" | "group" | "family") {
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

export function normalizeTranscript(input: string, filename: string) {
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
async function deleteR2Prefix(bucket: R2Bucket, prefix: string) {
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    if (listed.objects.length) await bucket.delete(listed.objects.map((item) => item.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}
function metadataFromAnalysis(analysis: CanonicalSermonAnalysis): GeneratedPackage["metadata"] {
  return {
    sermonTitle: analysis.sermon.sermon_title || "",
    seriesTitle: analysis.sermon.series_title || "",
    scripture: analysis.sermon.primary_passage || "",
    speaker: analysis.sermon.speaker || "",
    confidence: analysis.source_quality.overall,
  };
}
async function loadAnalysis(bucket: R2Bucket, manifest: ProductionManifest) {
  if (!manifest.analysisStorageKey) return null;
  const object = await bucket.get(manifest.analysisStorageKey);
  if (!object) return null;
  try { return await object.json<CanonicalSermonAnalysis>(); } catch { return null; }
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
  if (/\.vtt$/i.test(value)) return "text/vtt; charset=utf-8";
  return "text/plain; charset=utf-8";
}
function sourceContentDisposition(filename: string) {
  const asciiFilename = clean(filename, 180).replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encodedFilename = encodeURIComponent(filename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${asciiFilename || "teaching-source"}"; filename*=UTF-8''${encodedFilename}`;
}
function serveExtractedSourceFallback(request: Request, object: R2ObjectBody, originalFilename: string) {
  const fallbackFilename = originalFilename.replace(/\.[^.]+$/, "") + ".extracted.txt";
  const headers = new Headers({
    "content-type": "text/plain; charset=utf-8",
    "content-disposition": sourceContentDisposition(fallbackFilename),
    "content-length": String(object.size),
    "cache-control": "private, no-store",
    "etag": object.httpEtag,
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow, noarchive",
    "x-sunday-multiplied-source-fallback": "extracted-text",
  });
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}
async function sha256Hex(value: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
