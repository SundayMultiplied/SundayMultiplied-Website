type ApprovalEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  BREVO_API_KEY?: string;
  APPROVAL_ADMIN_EMAIL?: string;
  APPROVAL_NOTIFICATION_EMAIL?: string;
  APPROVAL_REVIEWER_EMAIL?: string;
  APPROVAL_FAILURE_EMAIL?: string;
  PUBLIC_SITE_ORIGIN?: string;
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
  reviewerEmail?: string;
  resources?: Array<{ kind?: string; title?: string; previewUrl?: string }>;
};

type NotificationResult = {
  status: "sent" | "failed" | "skipped";
  message: string;
  providerStatus?: number;
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

  const retryNotificationMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)\/notification$/);
  if (retryNotificationMatch && request.method === "POST") {
    if (!env.DB) return json({ error: "Approval database is not configured." }, 503);
    const authError = adminAuthorizationError(request, env);
    if (authError) return json({ error: authError }, 401);
    const reviewPackage = await findPackageById(env.DB, decodeURIComponent(retryNotificationMatch[1]));
    if (!reviewPackage) return json({ error: "Approval package not found." }, 404);
    if (!reviewPackage.id || !["approved", "revision_requested"].includes(reviewPackage.status ?? "")) {
      return json({ error: "A notification can only be sent after a decision is recorded." }, 409);
    }
    const result = await sendNotificationAndRecord(
      env,
      reviewPackage,
      reviewPackage.status ?? "approved",
      reviewPackage.reviewer_name || "Sunday Multiplied admin",
      reviewPackage.reviewer_email || "",
      "",
      [],
    );
    return json(result, result.status === "sent" ? 200 : 502);
  }

  if (["/api/approvals", "/approvals/api"].includes(url.pathname) && request.method === "GET") {
    if (!env.DB) return json({ error: "Approval database is not configured." }, 503);
    const authError = adminAuthorizationError(request, env);
    if (authError) return json({ error: authError }, 401);
    try {
      const rows = await env.DB.prepare(`
        SELECT p.id, p.title, p.week_of AS weekOf, p.status, p.updated_at AS updatedAt,
               c.name AS churchName, COUNT(r.id) AS resourceCount,
               (SELECT a.event_type FROM review_activity a
                WHERE a.package_id = p.id AND a.event_type LIKE 'notification_%'
                ORDER BY a.created_at DESC LIMIT 1) AS notificationEvent,
               (SELECT a.details FROM review_activity a
                WHERE a.package_id = p.id AND a.event_type LIKE 'notification_%'
                ORDER BY a.created_at DESC LIMIT 1) AS notificationDetails,
               (SELECT a.created_at FROM review_activity a
                WHERE a.package_id = p.id AND a.event_type LIKE 'notification_%'
                ORDER BY a.created_at DESC LIMIT 1) AS notificationUpdatedAt
        FROM review_packages p
        JOIN churches c ON c.id = p.church_id
        LEFT JOIN review_resources r ON r.package_id = p.id
        GROUP BY p.id
        ORDER BY p.updated_at DESC
      `).all();
      return json({ packages: rows.results.map(notificationSummary) });
    } catch (error) {
      console.error("approval_list_failed", error);
      return json({ error: "Approval database query failed. See Worker logs for approval_list_failed." }, 500);
    }
  }

  if (["/api/approvals", "/approvals/api"].includes(url.pathname) && request.method === "POST") {
    if (!env.DB) return json({ error: "Approval database is not configured." }, 503);
    const authError = adminAuthorizationError(request, env);
    if (authError) return json({ error: authError }, 401);
    return createPackage(request, { ...env, DB: env.DB }, env.PUBLIC_SITE_ORIGIN || "https://www.sundaymultiplied.com");
  }

  return null;
}

async function createPackage(request: Request, env: ApprovalEnv & { DB: D1Database }, origin: string) {
  const db = env.DB;
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
  const reviewUrl = `${origin}/review/${token}`;
  const persistedPackage = await findPackageById(db, packageId);
  if (!persistedPackage) {
    return json({ error: "The approval package could not be verified after creation." }, 500);
  }
  const persistedResources = await db.prepare("SELECT COUNT(*) AS count FROM review_resources WHERE package_id = ?")
    .bind(packageId).first<{ count: number }>();
  if (Number(persistedResources?.count ?? 0) !== resources.length) {
    return json({ error: "The approval resources could not be verified after creation." }, 500);
  }

  const notification = await sendReviewReadyNotificationAndRecord(
    env,
    persistedPackage,
    reviewUrl,
    resources,
    clean(body.reviewerEmail, 200),
  );
  return json({ ok: true, reviewUrl, notification }, 201);
}

async function findPackage(db: D1Database, tokenHash: string) {
  return db.prepare(`
    SELECT p.*, c.name AS church_name
    FROM review_packages p JOIN churches c ON c.id = p.church_id
    WHERE p.token_hash = ? LIMIT 1
  `).bind(tokenHash).first<Record<string, string | null>>();
}

async function findPackageById(db: D1Database, packageId: string) {
  return db.prepare(`
    SELECT p.*, c.name AS church_name
    FROM review_packages p JOIN churches c ON c.id = p.church_id
    WHERE p.id = ? LIMIT 1
  `).bind(packageId).first<Record<string, string | null>>();
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
    ctx.waitUntil(sendNotificationAndRecord(env, reviewPackage, status, reviewerName, reviewerEmail, overallFeedback, feedback));
  } else {
    await recordNotification(env.DB, reviewPackage.id, "skipped", {
      status: "skipped",
      message: "BREVO_API_KEY is unavailable to this production deployment.",
    });
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

async function sendReviewReadyNotificationAndRecord(
  env: ApprovalEnv,
  reviewPackage: Record<string, string | null>,
  reviewUrl: string,
  resources: Array<{ kind: string; title: string; previewUrl: string }>,
  requestedRecipient: string,
): Promise<NotificationResult> {
  const recipient = requestedRecipient || env.APPROVAL_REVIEWER_EMAIL || "brian@sundaymultiplied.com";
  if (!/^\S+@\S+\.\S+$/.test(recipient)) {
    const result: NotificationResult = { status: "failed", message: "The assigned reviewer email is invalid." };
    await recordReviewReadyNotification(env.DB, reviewPackage.id, result, recipient);
    return result;
  }
  if (!env.BREVO_API_KEY) {
    const result: NotificationResult = { status: "skipped", message: "BREVO_API_KEY is unavailable to this production deployment." };
    await recordReviewReadyNotification(env.DB, reviewPackage.id, result, recipient);
    return result;
  }

  const resourceList = resources.map((resource) => `- ${resource.title} (${resource.kind})`).join("\n");
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "Sunday Multiplied", email: "brian@sundaymultiplied.com" },
        to: [{ email: recipient }],
        subject: `Ready for review: ${reviewPackage.church_name} — ${reviewPackage.title}`,
        textContent: `A Sunday Multiplied approval package is ready.\n\nChurch: ${reviewPackage.church_name}\nWeek of: ${reviewPackage.week_of}\n\nResources:\n${resourceList}\n\nReview and approve the package:\n${reviewUrl}`,
      }),
    });
    const responsePreview = await readResponsePreview(response, 2048);
    const result: NotificationResult = response.ok
      ? { status: "sent", message: `Brevo accepted the review-ready email for ${recipient}.`, providerStatus: response.status }
      : { status: "failed", message: brevoErrorMessage(response.status, responsePreview), providerStatus: response.status };
    await recordReviewReadyNotification(env.DB, reviewPackage.id, result, recipient);
    if (!response.ok) {
      await sendReviewReadyFailureAlert(env, reviewPackage, result);
      console.error(JSON.stringify({ event: "review_ready_email_failed", packageId: reviewPackage.id, status: response.status, message: result.message }));
    }
    return result;
  } catch (error) {
    const result: NotificationResult = {
      status: "failed",
      message: `Brevo request failed: ${error instanceof Error ? clean(error.message, 300) : "Unknown network error."}`,
    };
    await recordReviewReadyNotification(env.DB, reviewPackage.id, result, recipient);
    await sendReviewReadyFailureAlert(env, reviewPackage, result);
    console.error(JSON.stringify({ event: "review_ready_email_failed", packageId: reviewPackage.id, message: result.message }));
    return result;
  }
}

async function sendReviewReadyFailureAlert(
  env: ApprovalEnv,
  reviewPackage: Record<string, string | null>,
  failure: NotificationResult,
) {
  if (!env.BREVO_API_KEY) return;
  const recipient = env.APPROVAL_FAILURE_EMAIL || "atobdavis@gmail.com";
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "Sunday Multiplied", email: "brian@sundaymultiplied.com" },
        to: [{ email: recipient }],
        subject: `Review-ready email failed: ${reviewPackage.church_name}`,
        textContent: `The approval package was created, but its review-ready email failed.\n\nPackage: ${reviewPackage.title}\nFailure: ${failure.message}\n\nOpen the approval dashboard to retry or contact the reviewer directly.`,
      }),
    });
    if (!response.ok) {
      console.error(JSON.stringify({ event: "review_ready_failure_alert_failed", packageId: reviewPackage.id, status: response.status }));
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "review_ready_failure_alert_failed", packageId: reviewPackage.id, message: error instanceof Error ? clean(error.message, 300) : "Unknown network error." }));
  }
}

async function recordReviewReadyNotification(
  db: D1Database | undefined,
  packageId: string | null,
  result: NotificationResult,
  recipient: string,
) {
  if (!db || !packageId) return;
  await db.prepare("INSERT INTO review_activity (id, package_id, event_type, details, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(
      crypto.randomUUID(),
      packageId,
      `review_ready_notification_${result.status}`,
      JSON.stringify({ ...result, recipient }),
      new Date().toISOString(),
    ).run();
}

async function sendNotificationAndRecord(
  env: ApprovalEnv,
  reviewPackage: Record<string, string | null>,
  status: string,
  reviewerName: string,
  reviewerEmail: string,
  overallFeedback: string,
  resourceFeedback: Array<{ resourceId: string; message: string }>,
): Promise<NotificationResult> {
  const recipient = env.APPROVAL_NOTIFICATION_EMAIL || "brian@sundaymultiplied.com";
  if (!env.BREVO_API_KEY) {
    const result: NotificationResult = { status: "skipped", message: "BREVO_API_KEY is unavailable to this production deployment." };
    await recordNotification(env.DB, reviewPackage.id, result.status, result);
    return result;
  }
  const action = status === "approved" ? "approved" : "requested revisions for";
  const details = [overallFeedback, ...resourceFeedback.map((item) => item.message)].filter(Boolean).join("\n\n");
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "Sunday Multiplied", email: "brian@sundaymultiplied.com" },
        to: [{ email: recipient }],
        replyTo: reviewerEmail ? { email: reviewerEmail, name: reviewerName } : undefined,
        subject: `${reviewPackage.church_name} ${action}: ${reviewPackage.title}`,
        textContent: `${reviewerName} ${action} ${reviewPackage.title}.\n\n${details || "No additional comments."}`,
      }),
    });
    const responsePreview = await readResponsePreview(response, 2048);
    const result: NotificationResult = response.ok
      ? { status: "sent", message: `Brevo accepted the email for ${recipient}.`, providerStatus: response.status }
      : { status: "failed", message: brevoErrorMessage(response.status, responsePreview), providerStatus: response.status };
    await recordNotification(env.DB, reviewPackage.id, result.status, result);
    if (!response.ok) console.error(JSON.stringify({ event: "approval_email_failed", packageId: reviewPackage.id, status: response.status, message: result.message }));
    return result;
  } catch (error) {
    const result: NotificationResult = {
      status: "failed",
      message: `Brevo request failed: ${error instanceof Error ? clean(error.message, 300) : "Unknown network error."}`,
    };
    await recordNotification(env.DB, reviewPackage.id, result.status, result);
    console.error(JSON.stringify({ event: "approval_email_failed", packageId: reviewPackage.id, message: result.message }));
    return result;
  }
}

async function recordNotification(
  db: D1Database | undefined,
  packageId: string | null,
  status: NotificationResult["status"],
  result: NotificationResult,
) {
  if (!db || !packageId) return;
  await db.prepare("INSERT INTO review_activity (id, package_id, event_type, details, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), packageId, `notification_${status}`, JSON.stringify(result), new Date().toISOString()).run();
}

function notificationSummary(row: Record<string, unknown>) {
  const event = typeof row.notificationEvent === "string" ? row.notificationEvent : "";
  let message = "";
  if (typeof row.notificationDetails === "string") {
    try {
      const details = JSON.parse(row.notificationDetails) as { message?: unknown };
      if (typeof details.message === "string") message = details.message;
    } catch {
      message = clean(row.notificationDetails, 400);
    }
  }
  return {
    ...row,
    notificationStatus: event.startsWith("notification_") ? event.slice("notification_".length) : "not_attempted",
    notificationMessage: message,
  };
}

async function readResponsePreview(response: Response, limit: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let output = "";
  while (output.length < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return output.slice(0, limit);
}

function brevoErrorMessage(status: number, responseBody: string) {
  let providerMessage = "";
  try {
    const parsed = JSON.parse(responseBody) as { code?: unknown; message?: unknown };
    const code = typeof parsed.code === "string" ? clean(parsed.code, 80) : "";
    const message = typeof parsed.message === "string" ? clean(parsed.message, 300) : "";
    providerMessage = [code, message].filter(Boolean).join(": ");
  } catch {
    providerMessage = "";
  }
  return `Brevo rejected the email (HTTP ${status})${providerMessage ? `: ${providerMessage}` : "."}`;
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
