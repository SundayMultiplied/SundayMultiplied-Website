import { handleApprovalApi } from "./approval-api";

type RevisionEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  BREVO_API_KEY?: string;
  APPROVAL_ADMIN_EMAIL?: string;
  APPROVAL_NOTIFICATION_EMAIL?: string;
  APPROVAL_REVIEWER_EMAIL?: string;
  APPROVAL_FAILURE_EMAIL?: string;
  PUBLIC_SITE_ORIGIN?: string;
};

type ResourceDecisionInput = {
  resourceId?: string;
  decision?: "approve" | "request_revision";
  sections?: string[];
  action?: string;
  message?: string;
};

type StructuredDecisionBody = {
  reviewerName?: string;
  reviewerEmail?: string;
  overallFeedback?: string;
  resourceDecisions?: ResourceDecisionInput[];
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const ACTIVE_REVIEW_STATUSES = new Set(["ready_for_review", "viewed", "revised"]);
const REVISION_QUEUE_URL = "https://admin.sundaymultiplied.com/approvals#needs-revision";

export async function handleRevisionApi(
  request: Request,
  env: RevisionEnv,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === "/api/revision-requests" && request.method === "GET") {
    if (!env.DB) return json({ error: "Approval database is not configured." }, 503);
    const authError = adminAuthorizationError(request, env);
    if (authError) return json({ error: authError }, 401);
    await ensureRevisionSchema(env.DB);
    const rows = await env.DB.prepare(`
      SELECT rr.id, rr.package_id AS packageId, rr.resource_id AS resourceId,
             rr.source_version AS sourceVersion, rr.sections_json AS sectionsJson,
             rr.action, rr.message, rr.reviewer_name AS reviewerName,
             rr.reviewer_email AS reviewerEmail, rr.status, rr.created_at AS createdAt,
             p.title AS packageTitle, p.week_of AS weekOf, p.scripture,
             c.name AS churchName, r.kind AS resourceKind, r.title AS resourceTitle,
             r.preview_url AS previewUrl
      FROM review_revision_requests rr
      JOIN review_packages p ON p.id = rr.package_id
      JOIN churches c ON c.id = p.church_id
      JOIN review_resources r ON r.id = rr.resource_id
      WHERE rr.status = 'pending'
      ORDER BY rr.created_at DESC
    `).all<Record<string, unknown>>();
    return json({
      revisions: rows.results.map((row) => ({
        ...row,
        sections: parseSections(row.sectionsJson),
        sectionsJson: undefined,
      })),
    });
  }

  const reviewMatch = url.pathname.match(/^\/api\/reviews\/([^/]+)(?:\/(decision))?$/);
  if (!reviewMatch || !env.DB) return null;
  const action = reviewMatch[2] || "";

  const token = decodeURIComponent(reviewMatch[1]);
  const tokenHash = await sha256(token);
  const reviewPackage = await findPackage(env.DB, tokenHash);
  if (!reviewPackage) return json({ error: "This review link is invalid or has expired." }, 404);
  await ensureRevisionSchema(env.DB);

  if (request.method === "GET" && !action) {
    const resources = await env.DB.prepare(`
      SELECT r.id, r.kind, r.title, r.version, r.preview_url AS previewUrl,
             COALESCE(d.decision,
               CASE WHEN ? = 'approved' THEN 'approved' ELSE 'pending' END
             ) AS reviewDecision
      FROM review_resources r
      LEFT JOIN review_resource_decisions d
        ON d.package_id = r.package_id AND d.resource_id = r.id
      WHERE r.package_id = ?
      ORDER BY r.sort_order, r.title
    `).bind(reviewPackage.status, reviewPackage.id).all();
    return json({
      id: reviewPackage.id,
      churchName: reviewPackage.church_name,
      title: reviewPackage.title,
      seriesTitle: reviewPackage.series_title,
      weekOf: reviewPackage.week_of,
      scripture: reviewPackage.scripture,
      status: reviewPackage.status,
      reviewerName: reviewPackage.reviewer_name,
      reviewerEmail: reviewPackage.reviewer_email,
      resources: resources.results,
    });
  }

  if (request.method !== "POST" || action !== "decision") return null;

  let body: StructuredDecisionBody;
  try {
    body = await request.json() as StructuredDecisionBody;
  } catch {
    return json({ error: "Invalid submission." }, 400);
  }
  if (!Array.isArray(body.resourceDecisions)) return null;
  if (!ACTIVE_REVIEW_STATUSES.has(String(reviewPackage.status || ""))) {
    return json({ error: "This package already has a recorded decision." }, 409);
  }

  const reviewerName = clean(body.reviewerName, 120);
  const reviewerEmail = clean(body.reviewerEmail, 200);
  const overallFeedback = clean(body.overallFeedback, 6000);
  if (!reviewerName) return json({ error: "Please enter your name." }, 400);
  if (reviewerEmail && !/^\S+@\S+\.\S+$/.test(reviewerEmail)) {
    return json({ error: "Please enter a valid email." }, 400);
  }

  const resources = await env.DB.prepare(
    "SELECT id, kind, title, version FROM review_resources WHERE package_id = ? ORDER BY sort_order, title",
  ).bind(reviewPackage.id).all<{ id: string; kind: string; title: string; version: number }>();
  const validResources = new Map(resources.results.map((item) => [item.id, item]));
  const decisions = body.resourceDecisions.map((item) => ({
    resourceId: clean(item.resourceId, 80),
    decision: item.decision,
    sections: Array.from(new Set((item.sections || []).map((section) => clean(section, 80)).filter(Boolean))).slice(0, 20),
    action: clean(item.action, 80),
    message: clean(item.message, 4000),
  }));

  if (decisions.length !== resources.results.length) {
    return json({ error: "Choose Approve or Request changes for every resource." }, 400);
  }
  const seen = new Set<string>();
  for (const item of decisions) {
    if (!item.resourceId || !validResources.has(item.resourceId) || seen.has(item.resourceId)) {
      return json({ error: "One or more resource decisions are invalid." }, 400);
    }
    seen.add(item.resourceId);
    if (!item.decision || !["approve", "request_revision"].includes(item.decision)) {
      return json({ error: "Choose Approve or Request changes for every resource." }, 400);
    }
    if (item.decision === "request_revision" && item.sections.length === 0) {
      return json({ error: "Select at least one section for each requested revision." }, 400);
    }
    if (item.decision === "request_revision" && !item.action) {
      return json({ error: "Choose the type of revision you want for each resource needing changes." }, 400);
    }
  }

  const packageDecision = decisions.some((item) => item.decision === "request_revision")
    ? "request_revision"
    : "approve";
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  for (const item of decisions) {
    statements.push(env.DB.prepare(`
      INSERT INTO review_resource_decisions
        (id, package_id, resource_id, decision, reviewer_name, reviewer_email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(package_id, resource_id) DO UPDATE SET
        decision = excluded.decision,
        reviewer_name = excluded.reviewer_name,
        reviewer_email = excluded.reviewer_email,
        updated_at = excluded.updated_at
    `).bind(
      crypto.randomUUID(), reviewPackage.id, item.resourceId, item.decision === "approve" ? "approved" : "revision_requested",
      reviewerName, reviewerEmail || null, now, now,
    ));

    statements.push(env.DB.prepare(
      "DELETE FROM review_revision_requests WHERE package_id = ? AND resource_id = ? AND status = 'pending'",
    ).bind(reviewPackage.id, item.resourceId));

    if (item.decision === "request_revision") {
      const resource = validResources.get(item.resourceId)!;
      statements.push(env.DB.prepare(`
        INSERT INTO review_revision_requests
          (id, package_id, resource_id, source_version, sections_json, action, message,
           reviewer_name, reviewer_email, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).bind(
        crypto.randomUUID(), reviewPackage.id, item.resourceId, Number(resource.version || 1),
        JSON.stringify(item.sections), item.action, item.message || null,
        reviewerName, reviewerEmail || null, now, now,
      ));
    }
  }
  await env.DB.batch(statements);

  const legacyFeedback = decisions
    .filter((item) => item.decision === "request_revision")
    .map((item) => ({
      resourceId: item.resourceId,
      message: revisionSummary(item.sections, item.action, item.message),
    }));
  const notificationFeedback = packageDecision === "request_revision"
    ? [overallFeedback, `Open the Needs Revision queue:\n${REVISION_QUEUE_URL}`].filter(Boolean).join("\n\n")
    : overallFeedback;
  const legacyRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      decision: packageDecision,
      reviewerName,
      reviewerEmail,
      overallFeedback: notificationFeedback,
      resourceFeedback: legacyFeedback,
    }),
  });
  return handleApprovalApi(legacyRequest, env, ctx);
}

async function ensureRevisionSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS review_resource_decisions (
      id TEXT PRIMARY KEY NOT NULL,
      package_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      reviewer_name TEXT NOT NULL,
      reviewer_email TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(package_id, resource_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS review_revision_requests (
      id TEXT PRIMARY KEY NOT NULL,
      package_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      source_version INTEGER NOT NULL DEFAULT 1,
      sections_json TEXT NOT NULL,
      action TEXT NOT NULL,
      message TEXT,
      reviewer_name TEXT NOT NULL,
      reviewer_email TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS review_resource_decisions_package_idx ON review_resource_decisions(package_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS review_revision_requests_package_idx ON review_revision_requests(package_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS review_revision_requests_status_idx ON review_revision_requests(status)"),
  ]);
}

async function findPackage(db: D1Database, tokenHash: string) {
  return db.prepare(`
    SELECT p.*, c.name AS church_name
    FROM review_packages p JOIN churches c ON c.id = p.church_id
    WHERE p.token_hash = ? LIMIT 1
  `).bind(tokenHash).first<Record<string, string | null>>();
}

function revisionSummary(sections: string[], action: string, message: string) {
  const labels = sections.length ? `Sections: ${sections.join(", ")}.` : "";
  const requestedAction = action ? ` Request: ${action.replaceAll("_", " ")}.` : "";
  const note = message ? ` Notes: ${message}` : "";
  return `${labels}${requestedAction}${note}`.trim();
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

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function adminAuthorizationError(request: Request, env: RevisionEnv) {
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
