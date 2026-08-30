type PackageFinalizationEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
};

type FinalizationResult = {
  status: "archived" | "failed" | "skipped";
  message: string;
  archivePrefix?: string;
};

type FinalizationPackage = {
  id: string;
  title: string | null;
  seriesTitle: string | null;
  weekOf: string;
  scripture: string | null;
  reviewerName: string | null;
  reviewerEmail: string | null;
  churchName: string;
  churchSlug: string;
};

type FinalizationResource = {
  id: string;
  kind: string;
  title: string;
  version: number;
  storageKey: string | null;
  previewUrl: string | null;
};

export async function ensurePackageArchiveSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS review_package_archives (
      package_id TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL,
      archive_prefix TEXT,
      source_job_id TEXT,
      error TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS review_package_archives_status_idx ON review_package_archives(status)"),
  ]);
}

export async function finalizeApprovedPackage(env: PackageFinalizationEnv, packageId: string): Promise<FinalizationResult> {
  if (!env.DB || !env.BUCKET) return { status: "skipped", message: "Archive storage is not configured." };
  await ensurePackageArchiveSchema(env.DB);

  const existing = await env.DB.prepare(`
    SELECT status, archive_prefix AS archivePrefix FROM review_package_archives WHERE package_id = ? LIMIT 1
  `).bind(packageId).first<{ status: string; archivePrefix: string | null }>();
  if (existing?.status === "archived" && existing.archivePrefix) {
    return { status: "archived", message: "Package is already archived.", archivePrefix: existing.archivePrefix };
  }

  const pkg = await env.DB.prepare(`
    SELECT p.id, p.title, p.series_title AS seriesTitle, p.week_of AS weekOf, p.scripture,
           p.reviewer_name AS reviewerName, p.reviewer_email AS reviewerEmail,
           c.name AS churchName, c.slug AS churchSlug
    FROM review_packages p JOIN churches c ON c.id = p.church_id
    WHERE p.id = ? LIMIT 1
  `).bind(packageId).first<FinalizationPackage>();
  if (!pkg) return { status: "failed", message: "Approval package not found." };

  const resources = await env.DB.prepare(`
    SELECT id, kind, title, version, storage_key AS storageKey, preview_url AS previewUrl
    FROM review_resources WHERE package_id = ? ORDER BY sort_order, title
  `).bind(packageId).all<FinalizationResource>();
  if (!resources.results.length) return failArchive(env.DB, packageId, "No resources were found to archive.");

  const year = /^\d{4}/.test(pkg.weekOf) ? pkg.weekOf.slice(0, 4) : "undated";
  const archivePrefix = `archives/${pkg.churchSlug}/${year}/${pkg.weekOf}/${pkg.id}`;
  const now = new Date().toISOString();
  const archivedResources: Array<{ id: string; kind: string; title: string; version: number; storageKey: string; sourceStorageKey: string }> = [];
  const sourceJobIds = new Set<string>();

  try {
    for (const resource of resources.results) {
      const production = productionSource(resource.previewUrl);
      if (production?.jobId) sourceJobIds.add(production.jobId);
      const sourceStorageKey = resource.storageKey || (production ? `production/jobs/${production.jobId}/${production.kind}.html` : "");
      if (!sourceStorageKey) throw new Error(`${resource.title} does not have an archivable source file.`);
      const sourceObject = await env.BUCKET.get(sourceStorageKey);
      if (!sourceObject) throw new Error(`Source file for ${resource.title} is unavailable.`);

      const destinationKey = `${archivePrefix}/resources/${safeSegment(resource.kind)}.v${Number(resource.version || 1)}.html`;
      await env.BUCKET.put(destinationKey, await sourceObject.arrayBuffer(), {
        httpMetadata: { contentType: sourceObject.httpMetadata?.contentType || "text/html; charset=utf-8" },
        customMetadata: {
          packageId: pkg.id, churchSlug: pkg.churchSlug, weekOf: pkg.weekOf,
          resourceId: resource.id, resourceKind: resource.kind,
          version: String(resource.version || 1), finalizedAt: now,
        },
      });
      archivedResources.push({ id: resource.id, kind: resource.kind, title: resource.title, version: Number(resource.version || 1), storageKey: destinationKey, sourceStorageKey });
    }

    const sourceJobId = [...sourceJobIds][0] || null;
    let analysisArchived = false;
    if (sourceJobId) {
      await copyOptional(env.BUCKET, `production/jobs/${sourceJobId}/transcript.txt`, `${archivePrefix}/transcript.txt`, "text/plain; charset=utf-8");
      analysisArchived = await copyOptional(env.BUCKET, `production/jobs/${sourceJobId}/sermon-analysis.json`, `${archivePrefix}/sermon-analysis.json`, "application/json; charset=utf-8");
      await copyOptional(env.BUCKET, `production/manifests/${sourceJobId}.json`, `${archivePrefix}/source-production-manifest.json`, "application/json; charset=utf-8");
    }

    const archiveManifest = {
      packageId: pkg.id,
      church: { name: pkg.churchName, slug: pkg.churchSlug },
      title: pkg.title,
      seriesTitle: pkg.seriesTitle,
      weekOf: pkg.weekOf,
      scripture: pkg.scripture,
      reviewer: { name: pkg.reviewerName, email: pkg.reviewerEmail },
      finalizedAt: now,
      sourceProductionJobIds: [...sourceJobIds],
      canonicalSermonAnalysis: analysisArchived ? `${archivePrefix}/sermon-analysis.json` : null,
      resources: archivedResources.map(({ sourceStorageKey, ...resource }) => resource),
    };
    await env.BUCKET.put(`${archivePrefix}/package.json`, JSON.stringify(archiveManifest, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });

    const statements: D1PreparedStatement[] = archivedResources.map((resource) => env.DB!.prepare(`
      UPDATE review_resources SET storage_key = ? WHERE id = ? AND package_id = ?
    `).bind(resource.storageKey, resource.id, pkg.id));
    statements.push(
      env.DB.prepare(`
        INSERT INTO review_package_archives
          (package_id, status, archive_prefix, source_job_id, error, archived_at, created_at, updated_at)
        VALUES (?, 'archived', ?, ?, NULL, ?, ?, ?)
        ON CONFLICT(package_id) DO UPDATE SET
          status = 'archived', archive_prefix = excluded.archive_prefix,
          source_job_id = excluded.source_job_id, error = NULL,
          archived_at = excluded.archived_at, updated_at = excluded.updated_at
      `).bind(pkg.id, archivePrefix, sourceJobId, now, now, now),
      env.DB.prepare(`
        INSERT INTO review_activity (id, package_id, event_type, details, created_at)
        VALUES (?, ?, 'package_archived', ?, ?)
      `).bind(crypto.randomUUID(), pkg.id, JSON.stringify({ archivePrefix, sourceJobId, resources: archivedResources.length, analysisArchived }), now),
    );
    await env.DB.batch(statements);

    return { status: "archived", message: `${archivedResources.length} final resources archived${analysisArchived ? " with canonical sermon analysis" : ""}.`, archivePrefix };
  } catch (error) {
    return failArchive(env.DB, packageId, error instanceof Error ? error.message : "Package archive failed.", archivePrefix);
  }
}

async function failArchive(db: D1Database, packageId: string, message: string, archivePrefix?: string): Promise<FinalizationResult> {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`
      INSERT INTO review_package_archives (package_id, status, archive_prefix, error, created_at, updated_at)
      VALUES (?, 'failed', ?, ?, ?, ?)
      ON CONFLICT(package_id) DO UPDATE SET status = 'failed', archive_prefix = excluded.archive_prefix,
        error = excluded.error, updated_at = excluded.updated_at
    `).bind(packageId, archivePrefix || null, message.slice(0, 1000), now, now),
    db.prepare(`INSERT INTO review_activity (id, package_id, event_type, details, created_at)
      VALUES (?, ?, 'package_archive_failed', ?, ?)`)
      .bind(crypto.randomUUID(), packageId, message.slice(0, 1000), now),
  ]);
  return { status: "failed", message, archivePrefix };
}

async function copyOptional(bucket: R2Bucket, sourceKey: string, destinationKey: string, contentType: string) {
  const source = await bucket.get(sourceKey);
  if (!source) return false;
  await bucket.put(destinationKey, await source.arrayBuffer(), { httpMetadata: { contentType } });
  return true;
}

function productionSource(previewUrl: string | null) {
  if (!previewUrl) return null;
  const match = previewUrl.match(/\/api\/production\/preview\/([^/]+)\/(monday|group|family)(?:$|[?#])/i);
  return match ? { jobId: match[1], kind: match[2].toLowerCase() } : null;
}

function safeSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "resource";
}
