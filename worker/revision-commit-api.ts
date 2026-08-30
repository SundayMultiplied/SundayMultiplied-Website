type RevisionCommitEnv = {
  DB?: D1Database;
  APPROVAL_ADMIN_EMAIL?: string;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export async function handleRevisionCommitApi(request: Request, env: RevisionCommitEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const isList = url.pathname === "/api/revision-requests" && request.method === "GET";
  const match = url.pathname.match(/^\/api\/revision-requests\/([^/]+)\/commit$/);
  if (!isList && (!match || request.method !== "POST")) return null;

  if (!env.DB) return json({ error: "Approval database is not configured." }, 503);
  const authError = adminAuthorizationError(request, env);
  if (authError) return json({ error: authError }, 401);

  if (isList) return listRevisionRequests(env.DB);

  const revisionId = decodeURIComponent(match![1]);
  const revision = await env.DB.prepare(`
    SELECT rr.id, rr.package_id AS packageId, rr.resource_id AS resourceId,
           rr.status, r.title AS resourceTitle
    FROM review_revision_requests rr
    JOIN review_resources r ON r.id = rr.resource_id
    WHERE rr.id = ? LIMIT 1
  `).bind(revisionId).first<{
    id: string;
    packageId: string;
    resourceId: string;
    status: string;
    resourceTitle: string;
  }>();

  if (!revision) return json({ error: "Revision request not found." }, 404);
  if (revision.status === "ready_for_reapproval") {
    return json({ ok: true, status: revision.status, resourceTitle: revision.resourceTitle });
  }
  if (revision.status !== "pending") {
    return json({ error: "This revision request can no longer be committed." }, 409);
  }

  const proposed = await env.DB.prepare(`
    SELECT id, version, storage_key AS storageKey
    FROM review_revision_versions
    WHERE revision_request_id = ? AND status = 'ready_for_internal_review'
    ORDER BY version DESC LIMIT 1
  `).bind(revisionId).first<{ id: string; version: number; storageKey: string }>();

  if (!proposed?.storageKey) {
    return json({ error: "Generate and review a proposed revision before creating the revised resource." }, 409);
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE review_resources
      SET version = ?, storage_key = ?
      WHERE id = ? AND package_id = ?
    `).bind(proposed.version, proposed.storageKey, revision.resourceId, revision.packageId),
    env.DB.prepare(`
      UPDATE review_revision_versions
      SET status = 'accepted'
      WHERE id = ?
    `).bind(proposed.id),
    env.DB.prepare(`
      UPDATE review_revision_requests
      SET status = 'ready_for_reapproval', updated_at = ?
      WHERE id = ?
    `).bind(now, revisionId),
    env.DB.prepare(`
      DELETE FROM review_resource_decisions
      WHERE package_id = ? AND resource_id = ?
    `).bind(revision.packageId, revision.resourceId),
    env.DB.prepare(`
      UPDATE review_packages
      SET status = 'revised', decided_at = NULL, updated_at = ?
      WHERE id = ?
    `).bind(now, revision.packageId),
    env.DB.prepare(`
      INSERT INTO review_activity (id, package_id, event_type, details, created_at)
      VALUES (?, ?, 'revision_committed', ?, ?)
    `).bind(
      crypto.randomUUID(),
      revision.packageId,
      JSON.stringify({ revisionRequestId: revisionId, resourceId: revision.resourceId, version: proposed.version }),
      now,
    ),
  ]);

  return json({
    ok: true,
    status: "ready_for_reapproval",
    version: proposed.version,
    resourceTitle: revision.resourceTitle,
  });
}

async function listRevisionRequests(db: D1Database) {
  await ensureRevisionVersionSchema(db);
  const rows = await db.prepare(`
    SELECT rr.id, rr.package_id AS packageId, rr.resource_id AS resourceId,
           rr.source_version AS sourceVersion, rr.sections_json AS sectionsJson,
           rr.action, rr.message, rr.reviewer_name AS reviewerName,
           rr.reviewer_email AS reviewerEmail, rr.status, rr.created_at AS createdAt,
           p.title AS packageTitle, p.week_of AS weekOf, p.scripture,
           c.name AS churchName, r.kind AS resourceKind, r.title AS resourceTitle,
           r.preview_url AS previewUrl,
           rv.version AS generatedVersion, rv.storage_key AS generatedStorageKey,
           rv.status AS generationStatus, rv.created_at AS generatedAt
    FROM review_revision_requests rr
    JOIN review_packages p ON p.id = rr.package_id
    JOIN churches c ON c.id = p.church_id
    JOIN review_resources r ON r.id = rr.resource_id
    LEFT JOIN review_revision_versions rv ON rv.id = (
      SELECT id FROM review_revision_versions
      WHERE revision_request_id = rr.id
      ORDER BY version DESC LIMIT 1
    )
    WHERE rr.status IN ('pending', 'ready_for_reapproval')
    ORDER BY CASE WHEN rr.status = 'pending' THEN 0 ELSE 1 END, rr.created_at DESC
  `).all<Record<string, unknown>>();

  return json({
    revisions: rows.results.map((row) => ({
      ...row,
      sections: parseSections(row.sectionsJson),
      sectionsJson: undefined,
      generatedPreviewUrl: row.generatedVersion ? `/api/revision-requests/${encodeURIComponent(String(row.id))}/preview` : null,
    })),
  });
}

async function ensureRevisionVersionSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS review_revision_versions (
      id TEXT PRIMARY KEY NOT NULL,
      revision_request_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      storage_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready_for_internal_review',
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS review_revision_versions_request_idx ON review_revision_versions(revision_request_id)"),
  ]);
}

function parseSections(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function adminAuthorizationError(request: Request, env: RevisionCommitEnv) {
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
