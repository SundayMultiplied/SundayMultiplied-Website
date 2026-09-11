import { strFromU8, unzipSync } from "fflate";
import { validateFamilyV3Html, resolveFamilyWorshipPreferences } from "./family-resource.ts";
import { validateMidweekV3Html } from "./midweek-resource.ts";
import type { CanonicalSermonAnalysis } from "./sermon-analysis.ts";
import type { ChurchConfig, ProductionEnv, ProductionManifest } from "./production-api.ts";

export type ManualImportResourceKind = "monday" | "group" | "family" | "midweek";

export type ManualProductionImport = {
  churchSlug: string;
  weekOf: string;
  transcriptFilename: string;
  transcriptText: string;
  analysis: CanonicalSermonAnalysis;
  resources: Partial<Record<ManualImportResourceKind, string>>;
};

const RESOURCE_KINDS: ManualImportResourceKind[] = ["monday", "group", "family", "midweek"];

export async function handleManualProductionImport(
  request: Request,
  env: ProductionEnv,
  churches: ChurchConfig[],
): Promise<Response> {
  if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Invalid manual import form." }, 400);
  }

  let input: ManualProductionImport;
  const packageFile = form.get("package");
  if (packageFile instanceof File && packageFile.size > 0) {
    if (!/\.zip$/i.test(packageFile.name)) return json({ error: "Manual production package must be a .zip file." }, 400);
    if (packageFile.size > 25_000_000) return json({ error: "Manual production package is too large. Maximum upload is 25 MB." }, 413);
    try {
      input = parseManualProductionZip(new Uint8Array(await packageFile.arrayBuffer()));
    } catch (error) {
      return json({ error: error instanceof Error ? clean(error.message, 500) : "Manual production package could not be read." }, 422);
    }
  } else {
    const parsed = await parseIndividualImportForm(form);
    if (parsed instanceof Response) return parsed;
    input = parsed;
  }

  const church = churches.find((item) => item.slug === input.churchSlug);
  if (!church) return json({ error: `The package references an unconfigured church: ${input.churchSlug || "unknown"}.` }, 400);

  const validation = validateManualProductionImport(input, church);
  if (!validation.ok) return json({ error: validation.error }, 422);

  const duplicate = await findDuplicateManifest(env.BUCKET, input.churchSlug, input.weekOf);
  if (duplicate) {
    return json({
      error: `A production job already exists for ${church.name} on ${input.weekOf}. Delete that job first if you intend to replace it.`,
      existingJobId: duplicate.id,
    }, 409);
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const analysis = input.analysis;
  const controllingSourceId = analysis.source_authority?.controlling_source_id || `transcript-${id}`;
  const transcriptKey = `production/jobs/${id}/sources/${controllingSourceId}/${safeStorageName(input.transcriptFilename)}`;
  const analysisKey = `production/jobs/${id}/sermon-analysis.json`;

  await env.BUCKET.put(transcriptKey, input.transcriptText, { httpMetadata: { contentType: /\.vtt$/i.test(input.transcriptFilename) ? "text/vtt; charset=utf-8" : "text/plain; charset=utf-8" } });
  await env.BUCKET.put(analysisKey, JSON.stringify(analysis, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8" } });

  const origin = env.PUBLIC_SITE_ORIGIN || new URL(request.url).origin;
  const manifestResources: ProductionManifest["resources"] = [];
  for (const kind of church.resources) {
    const resourceHtml = input.resources[kind];
    if (!resourceHtml) continue;
    const storageKey = `production/jobs/${id}/${kind}.html`;
    await env.BUCKET.put(storageKey, resourceHtml, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
    manifestResources.push({
      kind: titleCase(kind),
      title: `${titleCase(kind)} Multiplied`,
      storageKey,
      previewUrl: `${origin}/api/production/preview/${id}/${kind}`,
    });
  }

  const metadata = {
    sermonTitle: analysis.sermon.sermon_title || "",
    seriesTitle: analysis.sermon.series_title || "",
    scripture: analysis.sermon.primary_passage || "",
    speaker: analysis.sermon.speaker || "",
    confidence: analysis.source_quality.overall,
  } as ProductionManifest["metadata"];

  const manifest: ProductionManifest = {
    id,
    churchSlug: church.slug,
    churchName: church.name,
    weekOf: input.weekOf,
    createdAt,
    status: "ready_for_internal_review",
    sourceFilename: input.transcriptFilename,
    sourceFiles: [{
      sourceId: controllingSourceId,
      sourceType: "transcript",
      filename: input.transcriptFilename,
      storageKey: transcriptKey,
      status: "analyzed",
    }],
    metadataOverrides: {
      speaker: metadata.speaker || undefined,
      sermonTitle: metadata.sermonTitle || undefined,
      seriesTitle: metadata.seriesTitle || undefined,
      primaryPassage: metadata.scripture || undefined,
    },
    familyWorship: church.familyWorship,
    midweekDelivery: church.midweekDelivery,
    analysisStorageKey: analysisKey,
    analysisId: analysis.analysis_id,
    fidelityResult: analysis.fidelity_audit.result,
    analysisAcceptedAt: createdAt,
    analysisAcceptedBy: accessIdentityEmail(request) || "manual-import",
    analysisAttempt: 1,
    analysisLastGeneratedAt: analysis.created_at || createdAt,
    metadata,
    resources: manifestResources,
  };

  await env.BUCKET.put(`production/manifests/${id}.json`, JSON.stringify(manifest, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  return json({ ok: true, job: manifest }, 201);
}

async function parseIndividualImportForm(form: FormData): Promise<ManualProductionImport | Response> {
  const churchSlug = clean(String(form.get("churchSlug") || ""), 120);
  const weekOf = clean(String(form.get("weekOf") || ""), 10);
  if (!churchSlug) return json({ error: "Choose a configured church." }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) return json({ error: "Choose a valid sermon date." }, 400);

  const transcriptFile = form.get("transcript");
  const analysisFile = form.get("analysis");
  if (!(transcriptFile instanceof File) || transcriptFile.size === 0) return json({ error: "Upload the saved sermon transcript." }, 400);
  if (!(analysisFile instanceof File) || analysisFile.size === 0) return json({ error: "Upload the canonical sermon-analysis JSON file." }, 400);
  if (!/\.(txt|vtt)$/i.test(transcriptFile.name)) return json({ error: "Transcript must be a .txt or .vtt file." }, 400);
  if (!/\.json$/i.test(analysisFile.name)) return json({ error: "Sermon analysis must be a .json file." }, 400);
  if (transcriptFile.size > 5_000_000) return json({ error: "Transcript is too large. Maximum upload is 5 MB." }, 413);
  if (analysisFile.size > 5_000_000) return json({ error: "Sermon analysis is too large. Maximum upload is 5 MB." }, 413);

  let analysis: CanonicalSermonAnalysis;
  try { analysis = JSON.parse(await analysisFile.text()) as CanonicalSermonAnalysis; }
  catch { return json({ error: "Sermon analysis JSON is malformed." }, 400); }

  const resources: Partial<Record<ManualImportResourceKind, string>> = {};
  for (const kind of RESOURCE_KINDS) {
    const value = form.get(kind);
    if (!(value instanceof File) || value.size === 0) continue;
    if (!/\.html?$/i.test(value.name)) return json({ error: `${titleCase(kind)} resource must be an HTML file.` }, 400);
    if (value.size > 2_000_000) return json({ error: `${titleCase(kind)} resource is too large. Maximum upload is 2 MB.` }, 413);
    resources[kind] = await value.text();
  }

  return {
    churchSlug,
    weekOf,
    transcriptFilename: clean(transcriptFile.name, 180),
    transcriptText: await transcriptFile.text(),
    analysis,
    resources,
  };
}

export function parseManualProductionZip(bytes: Uint8Array): ManualProductionImport {
  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(bytes); }
  catch { throw new Error("The ZIP file is invalid or corrupted."); }

  const paths = Object.keys(entries).filter((path) => !path.endsWith("/"));
  const manifestPaths = paths.filter((path) => /(?:^|\/)r2\/production\/manifests\/[^/]+\.json$/i.test(path) || /(?:^|\/)production\/manifests\/[^/]+\.json$/i.test(path));
  if (manifestPaths.length !== 1) throw new Error("The ZIP package must contain exactly one production manifest under r2/production/manifests/. ");

  let sourceManifest: ProductionManifest;
  try { sourceManifest = JSON.parse(readZipText(entries, manifestPaths[0])) as ProductionManifest; }
  catch { throw new Error("The packaged production manifest is malformed JSON."); }

  if (!sourceManifest.churchSlug || !sourceManifest.weekOf || !sourceManifest.analysisStorageKey) throw new Error("The packaged production manifest is missing church, date, or analysis storage metadata.");
  const rootPrefix = manifestPaths[0].slice(0, manifestPaths[0].indexOf("production/manifests/"));
  const analysisPath = `${rootPrefix}${sourceManifest.analysisStorageKey}`;
  const analysisText = readZipText(entries, analysisPath);
  let analysis: CanonicalSermonAnalysis;
  try { analysis = JSON.parse(analysisText) as CanonicalSermonAnalysis; }
  catch { throw new Error("The packaged sermon-analysis.json is malformed JSON."); }

  const transcriptSource = sourceManifest.sourceFiles?.find((source) => source.sourceType === "transcript");
  if (!transcriptSource?.storageKey) throw new Error("The packaged production manifest does not identify a transcript source.");
  const transcriptPath = `${rootPrefix}${transcriptSource.storageKey}`;
  const transcriptText = readZipText(entries, transcriptPath);

  const resources: Partial<Record<ManualImportResourceKind, string>> = {};
  for (const kind of RESOURCE_KINDS) {
    const packaged = sourceManifest.resources.find((resource) => resource.kind.toLowerCase() === kind);
    if (!packaged?.storageKey) continue;
    resources[kind] = readZipText(entries, `${rootPrefix}${packaged.storageKey}`);
  }

  return {
    churchSlug: clean(sourceManifest.churchSlug, 120),
    weekOf: clean(sourceManifest.weekOf, 10),
    transcriptFilename: clean(transcriptSource.filename || sourceManifest.sourceFilename || "sermon-transcript.txt", 180),
    transcriptText,
    analysis,
    resources,
  };
}

export function validateManualProductionImport(input: ManualProductionImport, church: ChurchConfig): { ok: true } | { ok: false; error: string } {
  if (input.churchSlug !== church.slug) return { ok: false, error: "Imported church does not match the selected church." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.weekOf)) return { ok: false, error: "Imported sermon date is invalid." };
  if (!input.transcriptText.trim()) return { ok: false, error: "Imported transcript is empty." };
  if (input.transcriptText.length < 500) return { ok: false, error: "Imported transcript is too short to be a reliable sermon source." };

  const analysis = input.analysis as CanonicalSermonAnalysis | undefined;
  if (!analysis || analysis.schema_version !== "3.0") return { ok: false, error: "Manual import requires a Canonical Sermon Analysis v3 file." };
  if (!analysis.analysis_id || !analysis.sermon || !analysis.source_authority || !analysis.source_quality || !analysis.fidelity_audit) return { ok: false, error: "Canonical sermon analysis is missing required production fields." };
  if (analysis.sermon.church_id !== church.slug) return { ok: false, error: `Analysis church_id must be ${church.slug}.` };
  if (analysis.sermon.sermon_date !== input.weekOf) return { ok: false, error: `Analysis sermon_date must be ${input.weekOf}.` };
  if (!analysis.source_authority.transcript_available || !analysis.source_authority.controlling_source_id) return { ok: false, error: "Canonical analysis must identify an available controlling transcript source." };
  if (analysis.source_quality.generation_disposition === "blocked" || analysis.fidelity_audit.result === "fail") return { ok: false, error: "This analysis is blocked by its fidelity audit and cannot be imported as review-ready production." };

  for (const kind of church.resources) {
    const resource = input.resources[kind];
    if (!resource?.trim()) return { ok: false, error: `Upload the ${titleCase(kind)} HTML resource required by this church.` };
    const structureError = validateResourceHtml(kind, resource, church);
    if (structureError) return { ok: false, error: structureError };
  }
  return { ok: true };
}

function validateResourceHtml(kind: ManualImportResourceKind, resourceHtml: string, church: ChurchConfig): string | null {
  if (!/<main\b[^>]*class=["'][^"']*sm-document\b/i.test(resourceHtml)) return `${titleCase(kind)} HTML is missing the sm-document wrapper.`;
  if (!new RegExp(`<body\\b[^>]*class=["'][^"']*sm-${kind}\\b`, "i").test(resourceHtml)) return `${titleCase(kind)} HTML is missing the sm-${kind} body class.`;
  if (!/sm-header/.test(resourceHtml) || !/sm-footer/.test(resourceHtml)) return `${titleCase(kind)} HTML is missing the required Sunday Multiplied header or footer.`;
  if (!resourceHtml.includes(church.baseCssUrl) || !resourceHtml.includes(church.cssUrl)) return `${titleCase(kind)} HTML must link the current shared and church stylesheets.`;

  const scriptureSections = resourceHtml.match(/sm-section--scripture\b/gi)?.length || 0;
  if ((kind === "group" || kind === "family") && scriptureSections !== 1) return `${titleCase(kind)} HTML must include exactly one Scripture section.`;
  if (kind === "group" && /Midweek Reinforcement/i.test(resourceHtml)) return "Group HTML must not contain an embedded Midweek Reinforcement section.";
  if (kind === "family") {
    const preferences = resolveFamilyWorshipPreferences(church.familyWorship);
    const normalized = normalizeFinalFamilyForValidation(resourceHtml, preferences.platform, preferences.style !== "none");
    if (!normalized.ok) return normalized.error;
    try { validateFamilyV3Html(normalized.html, preferences); }
    catch (error) { return error instanceof Error ? error.message : "Family HTML failed the current Family V3 contract."; }
  }
  if (kind === "midweek") {
    try { validateMidweekV3Html(resourceHtml); }
    catch (error) { return error instanceof Error ? error.message : "Midweek HTML failed the current Midweek V3 contract."; }
  }
  return null;
}

function normalizeFinalFamilyForValidation(
  resourceHtml: string,
  platform: "youtube" | "spotify" | "apple_music",
  worshipRequired: boolean,
): { ok: true; html: string } | { ok: false; error: string } {
  if (!worshipRequired || resourceHtml.includes("{{SM_WORSHIP_SONG_URL}}")) return { ok: true, html: resourceHtml };
  const link = resourceHtml.match(/<a\b[^>]*class=["'][^"']*sm-worship-link\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/i)
    || resourceHtml.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*sm-worship-link\b[^"']*["'][^>]*>/i);
  if (!link?.[1]) return { ok: false, error: "Family V3 is missing the controlled worship-song link." };

  let url: URL;
  try { url = new URL(link[1]); }
  catch { return { ok: false, error: "Family worship link is invalid." }; }
  const allowedHost = platform === "spotify" ? "open.spotify.com" : platform === "apple_music" ? "music.apple.com" : "www.youtube.com";
  if (url.protocol !== "https:" || url.hostname !== allowedHost) return { ok: false, error: `Family worship link must use the configured ${platform} provider.` };

  const html = resourceHtml.replace(link[1], "{{SM_WORSHIP_SONG_URL}}");
  return { ok: true, html };
}

async function findDuplicateManifest(bucket: R2Bucket, churchSlug: string, weekOf: string): Promise<ProductionManifest | null> {
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix: "production/manifests/", cursor, limit: 1000 });
    for (const object of listed.objects) {
      const stored = await bucket.get(object.key);
      if (!stored) continue;
      try {
        const manifest = await stored.json<ProductionManifest>();
        if (manifest.churchSlug === churchSlug && manifest.weekOf === weekOf) return manifest;
      } catch {
        // Ignore malformed historical manifests instead of blocking a valid manual import.
      }
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return null;
}

function readZipText(entries: Record<string, Uint8Array>, path: string) {
  const exact = entries[path] || entries[path.replace(/^\.\//, "")];
  if (!exact) throw new Error(`The ZIP package is missing ${path}.`);
  return strFromU8(exact);
}

function accessIdentityEmail(request: Request) {
  return clean(request.headers.get("cf-access-authenticated-user-email") || request.headers.get("oai-authenticated-user-email") || "", 320);
}

function safeStorageName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "source.txt";
}

function clean(value: string, limit: number) {
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, limit);
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
