import type { CanonicalSermonAnalysis } from "./sermon-analysis";
import type { ProductionManifest } from "./production-api";
import { injectResourceHeaderMetadata } from "./resource-metadata.ts";

type ProductionJobAdminEnv = {
  BUCKET?: R2Bucket;
  DB?: D1Database;
  APPROVAL_ADMIN_EMAIL?: string;
};

type ProductionManifestSummary = {
  status?: "awaiting_analysis_review" | "ready_for_internal_review" | "sent_for_approval";
  analysisReviewId?: string;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export async function handleProductionJobAdminApi(request: Request, env: ProductionJobAdminEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/production\/jobs\/([^/]+)$/);
  if (!match || !["DELETE", "PATCH"].includes(request.method)) return null;

  if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
  const authError = adminAuthorizationError(request, env);
  if (authError) return json({ error: authError }, 401);

  const jobId = decodeURIComponent(match[1]).trim();
  if (!/^[a-zA-Z0-9-]{20,80}$/.test(jobId)) return json({ error: "Invalid production job ID." }, 400);

  const manifestKey = `production/manifests/${jobId}.json`;
  const manifestObject = await env.BUCKET.get(manifestKey);
  if (!manifestObject) return json({ error: "Production job not found." }, 404);

  if (request.method === "PATCH") {
    let manifest: ProductionManifest;
    try { manifest = await manifestObject.json<ProductionManifest>(); }
    catch { return json({ error: "Production job manifest is invalid." }, 500); }
    return updateProductionMetadata(request, env, manifest, manifestKey);
  }

  let manifest: ProductionManifestSummary = {};
  try { manifest = await manifestObject.json<ProductionManifestSummary>(); } catch { /* malformed manifests can still be cleaned up */ }
  if (manifest.status === "sent_for_approval") {
    return json({ error: "This production job is linked to an approval package and cannot be deleted yet." }, 409);
  }

  const prefix = `production/jobs/${jobId}/`;
  let cursor: string | undefined;
  do {
    const listed = await env.BUCKET.list({ prefix, cursor, limit: 1000 });
    const keys = listed.objects.map((object) => object.key);
    if (keys.length) await env.BUCKET.delete(keys);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  await env.BUCKET.delete(manifestKey);
  if (manifest.analysisReviewId) {
    await env.BUCKET.delete(`production/analysis-review-manifests/${manifest.analysisReviewId}.json`);
    await deletePrefix(env.BUCKET, `production/analysis-reviews/${manifest.analysisReviewId}/`);
  }
  return json({ ok: true, jobId });
}

async function updateProductionMetadata(
  request: Request,
  env: ProductionJobAdminEnv & { BUCKET: R2Bucket },
  manifest: ProductionManifest,
  manifestKey: string,
) {
  const body = await request.json().catch(() => null) as { sermonTitle?: unknown; seriesTitle?: unknown; speaker?: unknown } | null;
  if (!body) return json({ error: "Invalid sermon metadata." }, 400);

  const sermonTitle = typeof body.sermonTitle === "string" ? clean(body.sermonTitle, 240) : manifest.metadata.sermonTitle;
  const seriesTitle = typeof body.seriesTitle === "string" ? clean(body.seriesTitle, 240) : manifest.metadata.seriesTitle;
  const speaker = typeof body.speaker === "string" ? clean(body.speaker, 160) : manifest.metadata.speaker;
  if (!sermonTitle) return json({ error: "Sermon title is required." }, 400);

  const previous = {
    sermonTitle: manifest.metadata.sermonTitle || "",
    seriesTitle: manifest.metadata.seriesTitle || "",
    speaker: manifest.metadata.speaker || "",
  };
  manifest.metadata = { ...manifest.metadata, sermonTitle, seriesTitle, speaker };
  manifest.metadataOverrides = { ...manifest.metadataOverrides, sermonTitle, seriesTitle, speaker };

  if (manifest.analysisStorageKey) {
    const analysisObject = await env.BUCKET.get(manifest.analysisStorageKey);
    if (analysisObject) {
      try {
        const analysis = await analysisObject.json<CanonicalSermonAnalysis>();
        applyAnalysisMetadata(analysis, { sermonTitle, seriesTitle, speaker });
        await env.BUCKET.put(manifest.analysisStorageKey, JSON.stringify(analysis, null, 2), {
          httpMetadata: { contentType: "application/json; charset=utf-8" },
        });
      } catch (error) {
        console.error("production_metadata_analysis_update_failed", { jobId: manifest.id, error });
        return json({ error: "The saved sermon analysis could not be updated safely." }, 500);
      }
    }
  }

  if (manifest.analysisReviewId) {
    const shareKey = `production/analysis-review-manifests/${manifest.analysisReviewId}.json`;
    const shareObject = await env.BUCKET.get(shareKey);
    if (shareObject) {
      try {
        const share = await shareObject.json<Record<string, unknown>>();
        share.sermonTitle = sermonTitle;
        await env.BUCKET.put(shareKey, JSON.stringify(share, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
      } catch { /* The live shared analysis still reads the production manifest and canonical analysis. */ }
    }
  }

  const linkedPackageIds: string[] = [];
  const htmlKeys = new Set(manifest.resources.map((resource) => resource.storageKey).filter(Boolean));
  const archivePrefixes: string[] = [];
  if (env.DB) {
    const previewPattern = `%/api/production/preview/${manifest.id}/%`;
    const linked = await env.DB.prepare(`
      SELECT DISTINCT p.id AS packageId
      FROM review_packages p JOIN review_resources r ON r.package_id = p.id
      WHERE r.preview_url LIKE ?
    `).bind(previewPattern).all<{ packageId: string }>();
    linkedPackageIds.push(...linked.results.map((item) => item.packageId));

    const stored = await env.DB.prepare(`
      SELECT DISTINCT r.storage_key AS storageKey
      FROM review_resources r
      WHERE r.preview_url LIKE ? AND r.storage_key IS NOT NULL
    `).bind(previewPattern).all<{ storageKey: string }>();
    for (const item of stored.results) if (item.storageKey) htmlKeys.add(item.storageKey);

    const archives = await env.DB.prepare(`
      SELECT DISTINCT a.archive_prefix AS archivePrefix
      FROM review_package_archives a JOIN review_resources r ON r.package_id = a.package_id
      WHERE r.preview_url LIKE ? AND a.archive_prefix IS NOT NULL
    `).bind(previewPattern).all<{ archivePrefix: string }>();
    archivePrefixes.push(...archives.results.map((item) => item.archivePrefix).filter(Boolean));
  }

  for (const key of htmlKeys) await rewriteResourceMetadata(env.BUCKET, key, manifest);
  await env.BUCKET.put(manifestKey, JSON.stringify(manifest, null, 2), { httpMetadata: { contentType: "application/json" } });

  for (const prefix of archivePrefixes) {
    await updateArchiveMetadata(env.BUCKET, prefix, manifest);
  }

  if (env.DB && linkedPackageIds.length) {
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    for (const packageId of linkedPackageIds) {
      statements.push(
        env.DB.prepare("UPDATE review_packages SET title = ?, series_title = ?, updated_at = ? WHERE id = ?")
          .bind(sermonTitle, seriesTitle || null, now, packageId),
        env.DB.prepare("INSERT INTO review_activity (id, package_id, event_type, actor_name, details, created_at) VALUES (?, ?, 'sermon_metadata_updated', ?, ?, ?)")
          .bind(crypto.randomUUID(), packageId, accessIdentityEmail(request), JSON.stringify({ previous, next: { sermonTitle, seriesTitle, speaker }, sourceJobId: manifest.id }), now),
      );
    }
    await env.DB.batch(statements);
  }

  return json({ ok: true, job: manifest, linkedApprovalPackages: linkedPackageIds.length });
}

function applyAnalysisMetadata(analysis: CanonicalSermonAnalysis, values: { sermonTitle: string; seriesTitle: string; speaker: string }) {
  analysis.sermon.sermon_title = values.sermonTitle;
  analysis.sermon.series_title = values.seriesTitle;
  analysis.sermon.speaker = values.speaker;
  const sourceRef = analysis.source_bundle.church_metadata[0]?.source_id;
  if (!sourceRef) return;
  const fields = [
    ["sermon_title", values.sermonTitle],
    ["series_title", values.seriesTitle],
    ["speaker", values.speaker],
  ] as const;
  for (const [field, value] of fields) {
    analysis.sermon.metadata_evidence = analysis.sermon.metadata_evidence.filter((item) => item.field !== field);
    if (value) analysis.sermon.metadata_evidence.push({ field, value, source_type: "church_metadata", source_ref: sourceRef, confidence: "high" });
  }
}

async function rewriteResourceMetadata(bucket: R2Bucket, key: string, manifest: ProductionManifest) {
  const object = await bucket.get(key);
  if (!object) return;
  const html = injectResourceHeaderMetadata(await object.text(), manifest.metadata, manifest.weekOf);
  await bucket.put(key, html, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
    customMetadata: object.customMetadata,
  });
}

async function updateArchiveMetadata(bucket: R2Bucket, prefix: string, manifest: ProductionManifest) {
  const packageKey = `${prefix}/package.json`;
  const object = await bucket.get(packageKey);
  if (object) {
    try {
      const archive = await object.json<Record<string, unknown>>();
      archive.title = manifest.metadata.sermonTitle;
      archive.seriesTitle = manifest.metadata.seriesTitle || null;
      archive.speaker = manifest.metadata.speaker || null;
      await bucket.put(packageKey, JSON.stringify(archive, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
    } catch { /* Archived HTML and D1 metadata remain authoritative for display. */ }
  }
  await bucket.put(`${prefix}/source-production-manifest.json`, JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

async function deletePrefix(bucket: R2Bucket, prefix: string) {
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    if (listed.objects.length) await bucket.delete(listed.objects.map((item) => item.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

function adminAuthorizationError(request: Request, env: ProductionJobAdminEnv) {
  const email = accessIdentityEmail(request);
  const adminEmail = env.APPROVAL_ADMIN_EMAIL?.trim() || "brian@sundaymultiplied.com";
  if (!email || email.toLowerCase() !== adminEmail.toLowerCase()) return "Unauthorized.";
  return "";
}

function accessIdentityEmail(request: Request) {
  const headerEmail = request.headers.get("cf-access-authenticated-user-email")
    ?? request.headers.get("oai-authenticated-user-email");
  if (headerEmail) return headerEmail.trim();
  const assertion = request.headers.get("cf-access-jwt-assertion");
  const payload = assertion?.split(".")[1];
  if (!payload) return "";
  try {
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(base64)) as { email?: unknown };
    return typeof claims.email === "string" ? claims.email.trim() : "";
  } catch {
    return "";
  }
}

function clean(value: string, max: number) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
