type ApprovalEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  BREVO_API_KEY?: string;
  APPROVAL_ADMIN_EMAIL?: string;
  APPROVAL_NOTIFICATION_EMAIL?: string;
};

type DecisionBody = {
  decision?: "approve" | "request_revision";
  reviewerName?: string;
  reviewerEmail?: string;
  overallFeedback?: string;
  resourceFeedback?: Array<{ resourceId?: string; message?: string }>;
};

type CreatePackageBody = {
  churchName?: string;
  churchSlug?: string;
  title?: string;
  seriesTitle?: string;
  weekOf?: string;
  scripture?: string;
  resources?: Array<{ kind?: string; title?: string; previewUrl?: string }>;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export async function handleApprovalApi(
  request: Request,
  env: ApprovalEnv,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const reviewMatch = url.pathname.match(/^\/api\/reviews\/([^/]+)(?:\/(view|decision|resource\/([^/]+)))?$/);

  if (reviewMatch) {
    if (!env.DB) return json({ error: "Approval database is not configured." }, 503);
    const token = decodeURIComponent(reviewMatch[1]);
    const action = reviewMatch[2];
    const tokenHash = await sha256(token);
    const reviewPackage = await findPackage(env.DB, tokenHash);
    if (!reviewPackage) return json({ error: "This review link is invalid or has expired." }, 404);

    if (request.method === "GET" && !action) {
      return json(await packageResponse(env.DB, reviewPackage));
    }
    if (request.method === "GET" && action?.startsWith("resource/")) {
      return resourceResponse(env, reviewPackage.id, reviewMatch[3]);
    }
    if (request.method === "POST" && action === "view") {
      await markViewed(env.DB, reviewPackage.id, reviewPackage.status);
      return json({ ok: true });
    }
    if (request.method === "POST" && action === "decision") {
      return saveDecision(request, env, ctx, reviewPackage);
    }
    return json({ error: "Method not allowed." }, 405);
  }

  if (["/api/approvals", "/approvals/api"].includes(url.pathname) && request.method === "GET") {
    if (!env.DB) return json({ error: "Approval database is not configured." }, 503);
    const authError = adminAuthorizationError(request, env);
    if (authError) return json({ error: authError }, 401);
    try {
      const rows = await env.DB.prepare(`
        SELECT p.id, p.title, p.week_of AS weekOf, p.status, p.updated_at AS updatedAt,
               c.name AS churchName, COUNT(r.id) AS resourceCount
        FROM review_packages p
        JOIN churches c ON c.id = p.church_id
        LEFT JOIN review_resources r ON r.package_id = p.id
        GROUP BY p.id
        ORDER BY p.updated_at DESC
      `).all();
      return json({ packages: rows.results });
    } catch (error) {
      console.error("approval_list_failed", error);
      return json({ error: "Approval database query failed. See Worker logs for approval_list_failed." }, 500);
    }
  }

  if (["/api/approvals", "/approvals/api"].includes(url.pathname) && request.method === "POST") {
    if (!env.DB) return json({ error: "Approval database is not configured." }, 503);
    const authError = adminAuthorizationError(request, env);
    if (authError) return json({ error: authError }, 401);
    return createPackage(request, env.DB, url.origin);
  }

  return null;
}

async function createPackage(request: Request, db: D1Database, origin: string) {
  let body: CreatePackageBody;
  try {
    body = await request.json() as CreatePackageBody;
  } catch {
    return json({ error: "Invalid package details." }, 400);
  }
  const churchName = clean(body.churchName, 160);
  const churchSlug = slugify(clean(body.churchSlug, 120) || churchName);
  const title = clean(body.title, 180);
  const seriesTitle = clean(body.seriesTitle, 180);
  const weekOf = clean(body.weekOf, 10);
  const scripture = clean(body.scripture, 180);
  const resources = (body.resources ?? [])
    .map((item) => ({ kind: clean(item.kind, 40), title: clean(item.title, 160), previewUrl: validPreviewUrl(item.previewUrl) }))
    .filter((item) => item.kind && item.title);
  if (!churchName || !churchSlug || !title || !/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) {
    return json({ error: "Church, package title, and a valid week-of date are required." }, 400);
  }
  if (resources.length === 0) return json({ error: "Add at least one resource." }, 400);

  const now = new Date().toISOString();
  const churchId = crypto.randomUUID();
  const packageId = crypto.randomUUID();
  const token = secureToken();
  const tokenHash = await sha256(token);
  const statements = [
    db.prepare("INSERT INTO churches (id, name, slug, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET name = excluded.name")
      .bind(churchId, churchName, churchSlug, now),
    db.prepare(`INSERT INTO review_packages
      (id, church_id, title, series_title, week_of, scripture, token_hash, status, created_at, updated_at)
      VALUES (?, (SELECT id FROM churches WHERE slug = ?), ?, ?, ?, ?, ?, 'ready_for_review', ?, ?)`)
      .bind(packageId, churchSlug, title, seriesTitle || null, weekOf, scripture || null, tokenHash, now, now),
    db.prepare("INSERT INTO review_activity (id, package_id, event_type, details, created_at) VALUES (?, ?, 'ready_for_review', 'Review package created', ?)")
      .bind(crypto.randomUUID(), packageId, now),
  ];
  resources.forEach((resource, index) => {
    statements.push(db.prepare(`INSERT INTO review_resources
      (id, package_id, kind, title, version, preview_url, sort_order, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)`)
      .bind(crypto.randomUUID(), packageId, resource.kind, resource.title, resource.previewUrl || null, index, now));
  });
  await db.batch(statements);
  return json({ ok: true, reviewUrl: `${origin}/review/${token}` }, 201);
}

async function findPackage(db: D1Database, tokenHash: string) {
  return db.prepare(`
    SELECT p.*, c.name AS church_name
    FROM review_packages p JOIN churches c ON c.id = p.church_id
    WHERE p.token_hash = ? LIMIT 1
  `).bind(tokenHash).first<Record<string, string | null>>();
}

async function packageResponse(db: D1Database, row: Record<string, string | null>) {
  const resources = await db.prepare(`
    SELECT id, kind, title, version, preview_url AS previewUrl
    FROM review_resources WHERE package_id = ? ORDER BY sort_order, title
  `).bind(row.id).all();
  return {
    id: row.id,
    churchName: row.church_name,
    title: row.title,
    seriesTitle: row.series_title,
    weekOf: row.week_of,
    scripture: row.scripture,
    status: row.status,
    reviewerName: row.reviewer_name,
    reviewerEmail: row.reviewer_email,
    resources: resources.results,
  };
}

async function markViewed(db: D1Database, packageId: string | null, status: string | null) {
  if (!packageId || !["ready_for_review", "revised"].includes(status ?? "")) return;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE review_packages SET status = 'viewed', viewed_at = COALESCE(viewed_at, ?), updated_at = ? WHERE id = ?").bind(now, now, packageId),
    db.prepare("INSERT INTO review_activity (id, package_id, event_type, created_at) VALUES (?, ?, 'viewed', ?)").bind(crypto.randomUUID(), packageId, now),
  ]);
}

async function saveDecision(
  request: Request,
  env: ApprovalEnv & { DB?: D1Database },
  ctx: ExecutionContext,
  reviewPackage: Record<string, string | null>,
) {
  if (!["ready_for_review", "viewed", "revised"].includes(reviewPackage.status ?? "")) {
    return json({ error: "This package already has a recorded decision." }, 409);
  }
  let body: DecisionBody;
  try {
    body = await request.json() as DecisionBody;
  } catch {
    return json({ error: "Invalid submission." }, 400);
  }
  const reviewerName = clean(body.reviewerName, 120);
  const reviewerEmail = clean(body.reviewerEmail, 200);
  if (!reviewerName) return json({ error: "Please enter your name." }, 400);
  if (reviewerEmail && !/^\S+@\S+\.\S+$/.test(reviewerEmail)) return json({ error: "Please enter a valid email." }, 400);
  if (!body.decision || !["approve", "request_revision"].includes(body.decision)) return json({ error: "Choose an approval decision." }, 400);

  const feedback = (body.resourceFeedback ?? [])
    .map((item) => ({ resourceId: clean(item.resourceId, 80), message: clean(item.message, 4000) }))
    .filter((item) => item.resourceId && item.message);
  const overallFeedback = clean(body.overallFeedback, 6000);
  if (body.decision === "request_revision" && !overallFeedback && feedback.length === 0) {
    return json({ error: "Please describe the requested revision." }, 400);
  }

  const db = env.DB;
  if (!db || !reviewPackage.id) return json({ error: "Approval database is unavailable." }, 503);
  const now = new Date().toISOString();
  const status = body.decision === "approve" ? "approved" : "revision_requested";
  const statements = [
    db.prepare("UPDATE review_packages SET status = ?, reviewer_name = ?, reviewer_email = ?, decided_at = ?, updated_at = ? WHERE id = ?")
      .bind(status, reviewerName, reviewerEmail || null, now, now, reviewPackage.id),
    db.prepare("INSERT INTO review_activity (id, package_id, event_type, actor_name, details, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), reviewPackage.id, status, reviewerName, overallFeedback || null, now),
  ];
  if (overallFeedback) {
    statements.push(db.prepare("INSERT INTO review_feedback (id, package_id, reviewer_name, reviewer_email, message, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), reviewPackage.id, reviewerName, reviewerEmail || null, overallFeedback, now));
  }
  for (const item of feedback) {
    statements.push(db.prepare("INSERT INTO review_feedback (id, package_id, resource_id, reviewer_name, reviewer_email, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), reviewPackage.id, item.resourceId, reviewerName, reviewerEmail || null, item.message, now));
  }
  await db.batch(statements);

  if (env.BREVO_API_KEY) {
    ctx.waitUntil(sendNotification(env, reviewPackage, status, reviewerName, reviewerEmail, overallFeedback, feedback));
  }
  return json({ ok: true, status });
}

async function resourceResponse(env: ApprovalEnv, packageId: string | null, resourceId?: string) {
  if (!env.DB || !packageId || !resourceId) return json({ error: "Resource not found." }, 404);
  const resource = await env.DB.prepare("SELECT storage_key, preview_url FROM review_resources WHERE id = ? AND package_id = ? LIMIT 1")
    .bind(resourceId, packageId).first<{ storage_key: string | null; preview_url: string | null }>();
  if (!resource) return json({ error: "Resource not found." }, 404);
  if (resource.storage_key && env.BUCKET) {
    const object = await env.BUCKET.get(resource.storage_key);
    if (!object) return json({ error: "Resource file not found." }, 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  }
  if (resource.preview_url) return Response.redirect(resource.preview_url, 302);
  return json({ error: "Resource preview is not available yet." }, 404);
}

async function sendNotification(
  env: ApprovalEnv,
  reviewPackage: Record<string, string | null>,
  status: string,
  reviewerName: string,
  reviewerEmail: string,
  overallFeedback: string,
  resourceFeedback: Array<{ resourceId: string; message: string }>,
) {
  const recipient = env.APPROVAL_NOTIFICATION_EMAIL || "brian@sundaymultiplied.com";
  const action = status === "approved" ? "approved" : "requested revisions for";
  const details = [overallFeedback, ...resourceFeedback.map((item) => item.message)].filter(Boolean).join("\n\n");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY ?? "", "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: "Sunday Multiplied", email: "brian@sundaymultiplied.com" },
      to: [{ email: recipient }],
      replyTo: reviewerEmail ? { email: reviewerEmail, name: reviewerName } : undefined,
      subject: `${reviewPackage.church_name} ${action}: ${reviewPackage.title}`,
      textContent: `${reviewerName} ${action} ${reviewPackage.title}.\n\n${details || "No additional comments."}`,
    }),
  });
  if (!response.ok) console.error(JSON.stringify({ event: "approval_email_failed", status: response.status }));
}

function adminAuthorizationError(request: Request, env: ApprovalEnv) {
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

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function validPreviewUrl(value: unknown) {
  const text = clean(value, 1000);
  if (!text) return "";
  try {
    const url = new URL(text, "https://sundaymultiplied.com");
    return url.protocol === "https:" || url.origin === "https://sundaymultiplied.com" ? text : "";
  } catch {
    return "";
  }
}

function secureToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
