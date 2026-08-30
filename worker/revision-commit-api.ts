type RevisionCommitEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  BREVO_API_KEY?: string;
  APPROVAL_ADMIN_EMAIL?: string;
  APPROVAL_REVIEWER_EMAIL?: string;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export async function handleRevisionCommitApi(request: Request, env: RevisionCommitEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const isList = url.pathname === "/api/revision-requests" && request.method === "GET";
  const commitMatch = url.pathname.match(/^\/api\/revision-requests\/([^/]+)\/commit$/);
  const sendMatch = url.pathname.match(/^\/api\/revision-requests\/([^/]+)\/send$/);
  if (!isList && !commitMatch && !sendMatch) return null;
  if ((commitMatch || sendMatch) && request.method !== "POST") return null;

  if (!env.DB) return json({ error: "Approval database is not configured." }, 503);
  const authError = adminAuthorizationError(request, env);
  if (authError) return json({ error: authError }, 401);

  if (isList) return listRevisionRequests(env.DB);
  if (sendMatch) return sendForReapproval(env, decodeURIComponent(sendMatch[1]));

  const revisionId = decodeURIComponent(commitMatch![1]);
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
  if (["ready_for_reapproval", "sent_for_reapproval"].includes(revision.status)) {
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

async function sendForReapproval(env: RevisionCommitEnv, revisionId: string) {
  if (!env.DB) return json({ error: "Approval database is not configured." }, 503);
  if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
  if (!env.BREVO_API_KEY) return json({ error: "BREVO_API_KEY is not configured for final-approval notifications." }, 503);

  const revision = await env.DB.prepare(`
    SELECT rr.id, rr.package_id AS packageId, rr.resource_id AS resourceId, rr.status,
           rr.reviewer_email AS reviewerEmail,
           p.title AS packageTitle, p.week_of AS weekOf,
           c.name AS churchName,
           r.title AS resourceTitle, r.version, r.preview_url AS previewUrl
    FROM review_revision_requests rr
    JOIN review_packages p ON p.id = rr.package_id
    JOIN churches c ON c.id = p.church_id
    JOIN review_resources r ON r.id = rr.resource_id
    WHERE rr.id = ? LIMIT 1
  `).bind(revisionId).first<{
    id: string;
    packageId: string;
    resourceId: string;
    status: string;
    reviewerEmail: string | null;
    packageTitle: string;
    weekOf: string;
    churchName: string;
    resourceTitle: string;
    version: number;
    previewUrl: string | null;
  }>();

  if (!revision) return json({ error: "Revision request not found." }, 404);
  if (!["ready_for_reapproval", "sent_for_reapproval"].includes(revision.status)) {
    return json({ error: "Create the revised resource before sending it for final approval." }, 409);
  }

  const reviewUrl = await reviewUrlForResource(env.BUCKET, revision.previewUrl);
  if (!reviewUrl) {
    return json({ error: "The original secure review link could not be recovered for this production package." }, 409);
  }

  const recipient = revision.reviewerEmail || await originalReviewerRecipient(env.DB, revision.packageId) || env.APPROVAL_REVIEWER_EMAIL || "brian@sundaymultiplied.com";
  if (!/^\S+@\S+\.\S+$/.test(recipient)) return json({ error: "The pastoral reviewer email is unavailable or invalid." }, 409);

  const subject = `Revised resource ready for final approval: ${revision.churchName} — ${revision.packageTitle}`;
  const textContent = `A requested revision is ready for your final review.\n\nChurch: ${revision.churchName}\nWeek of: ${revision.weekOf}\nRevised resource: ${revision.resourceTitle} · Version ${revision.version}\n\nResources you previously approved remain approved. Please review the revised resource and submit your final response using the same secure review link:\n${reviewUrl}`;

  let response: Response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "Sunday Multiplied", email: "brian@sundaymultiplied.com" },
        to: [{ email: recipient }],
        subject,
        textContent,
      }),
    });
  } catch (error) {
    return json({ error: `Final-approval email failed: ${error instanceof Error ? clean(error.message, 300) : "Unknown network error."}` }, 502);
  }

  if (!response.ok) {
    const preview = clean(await response.text(), 500);
    return json({ error: `Brevo rejected the final-approval email (${response.status})${preview ? `: ${preview}` : "."}` }, 502);
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE review_revision_requests
      SET status = 'sent_for_reapproval', updated_at = ?
      WHERE id = ?
    `).bind(now, revisionId),
    env.DB.prepare(`
      INSERT INTO review_activity (id, package_id, event_type, details, created_at)
      VALUES (?, ?, 'revision_reapproval_sent', ?, ?)
    `).bind(
      crypto.randomUUID(),
      revision.packageId,
      JSON.stringify({ revisionRequestId: revisionId, resourceId: revision.resourceId, version: revision.version, recipient }),
      now,
    ),
  ]);

  return json({ ok: true, status: "sent_for_reapproval", recipient, reviewUrl });
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
    WHERE rr.status IN ('pending', 'ready_for_reapproval', 'sent_for_reapproval')
    ORDER BY CASE rr.status WHEN 'pending' THEN 0 WHEN 'ready_for_reapproval' THEN 1 ELSE 2 END, rr.created_at DESC
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

async function reviewUrlForResource(bucket: R2Bucket, previewUrl: string | null) {
  const match = previewUrl?.match(/\/api\/production\/preview\/([^/]+)\//i);
  if (!match) return "";
  const manifestObject = await bucket.get(`production/manifests/${match[1]}.json`);
  if (!manifestObject) return "";
  try {
    const manifest = await manifestObject.json<{ reviewUrl?: string }>();
    return typeof manifest.reviewUrl === "string" ? manifest.reviewUrl : "";
  } catch {
    return "";
  }
}

async function originalReviewerRecipient(db: D1Database, packageId: string) {
  const row = await db.prepare(`
    SELECT details FROM review_activity
    WHERE package_id = ? AND event_type = 'review_ready_notification_sent'
    ORDER BY created_at DESC LIMIT 1
  `).bind(packageId).first<{ details: string | null }>();
  if (!row?.details) return "";
  try {
    const details = JSON.parse(row.details) as { recipient?: unknown };
    return typeof details.recipient === "string" ? details.recipient : "";
  } catch {
    return "";
  }
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

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength) : "";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
