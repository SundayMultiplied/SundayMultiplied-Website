type ApprovalListEnv = {
  DB?: D1Database;
  APPROVAL_ADMIN_EMAIL?: string;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const SORT_COLUMNS: Record<string, string> = {
  updatedAt: "p.updated_at",
  weekOf: "p.week_of",
  churchName: "c.name",
  status: "p.status",
};

export async function handleApprovalListApi(request: Request, env: ApprovalListEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/approval-packages" || request.method !== "GET") return null;
  if (!env.DB) return json({ error: "Approval database is not configured." }, 503);

  const authError = adminAuthorizationError(request, env);
  if (authError) return json({ error: authError }, 401);

  const requestedPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
  const requestedPageSize = Number.parseInt(url.searchParams.get("pageSize") || "10", 10);
  const pageSize = Math.min(50, Math.max(5, Number.isFinite(requestedPageSize) ? requestedPageSize : 10));
  const sort = url.searchParams.get("sort") || "updatedAt";
  const direction = url.searchParams.get("direction") === "asc" ? "ASC" : "DESC";
  const sortColumn = SORT_COLUMNS[sort] || SORT_COLUMNS.updatedAt;

  try {
    const countRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM review_packages").first<{ count: number }>();
    const total = Number(countRow?.count || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(totalPages, Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1));
    const offset = (page - 1) * pageSize;

    const rows = await env.DB.prepare(`
      SELECT p.id, p.title, p.week_of AS weekOf, p.status, p.updated_at AS updatedAt,
             c.name AS churchName, COUNT(r.id) AS resourceCount,
             (SELECT a.event_type FROM review_activity a
              WHERE a.package_id = p.id AND a.event_type LIKE 'review_ready_notification_%'
              ORDER BY a.created_at DESC LIMIT 1) AS reviewNotificationEvent,
             (SELECT a.details FROM review_activity a
              WHERE a.package_id = p.id AND a.event_type LIKE 'review_ready_notification_%'
              ORDER BY a.created_at DESC LIMIT 1) AS reviewNotificationDetails,
             (SELECT a.created_at FROM review_activity a
              WHERE a.package_id = p.id AND a.event_type LIKE 'review_ready_notification_%'
              ORDER BY a.created_at DESC LIMIT 1) AS reviewNotificationUpdatedAt,
             (SELECT a.event_type FROM review_activity a
              WHERE a.package_id = p.id AND a.event_type LIKE 'notification_%'
              ORDER BY a.created_at DESC LIMIT 1) AS decisionNotificationEvent,
             (SELECT a.details FROM review_activity a
              WHERE a.package_id = p.id AND a.event_type LIKE 'notification_%'
              ORDER BY a.created_at DESC LIMIT 1) AS decisionNotificationDetails,
             (SELECT a.created_at FROM review_activity a
              WHERE a.package_id = p.id AND a.event_type LIKE 'notification_%'
              ORDER BY a.created_at DESC LIMIT 1) AS decisionNotificationUpdatedAt
      FROM review_packages p
      JOIN churches c ON c.id = p.church_id
      LEFT JOIN review_resources r ON r.package_id = p.id
      GROUP BY p.id
      ORDER BY ${sortColumn} ${direction}, p.id DESC
      LIMIT ? OFFSET ?
    `).bind(pageSize, offset).all();

    return json({
      packages: rows.results.map(notificationSummary),
      pagination: { page, pageSize, total, totalPages },
      sort: { field: sort in SORT_COLUMNS ? sort : "updatedAt", direction: direction.toLowerCase() },
    });
  } catch (error) {
    console.error("approval_paginated_list_failed", error);
    return json({ error: "Approval database query failed." }, 500);
  }
}

function notificationSummary(row: Record<string, unknown>) {
  const review = notificationFields(row.reviewNotificationEvent, row.reviewNotificationDetails, "review_ready_notification_");
  const decision = notificationFields(row.decisionNotificationEvent, row.decisionNotificationDetails, "notification_");
  return {
    ...row,
    reviewNotificationStatus: review.status,
    reviewNotificationMessage: review.message,
    decisionNotificationStatus: decision.status,
    decisionNotificationMessage: decision.message,
  };
}

function notificationFields(eventValue: unknown, detailsValue: unknown, prefix: string) {
  const event = typeof eventValue === "string" ? eventValue : "";
  let message = "";
  if (typeof detailsValue === "string") {
    try {
      const details = JSON.parse(detailsValue) as { message?: unknown };
      if (typeof details.message === "string") message = details.message;
    } catch {
      message = detailsValue.slice(0, 400);
    }
  }
  return {
    status: event.startsWith(prefix) ? event.slice(prefix.length) : "not_attempted",
    message,
  };
}

function adminAuthorizationError(request: Request, env: ApprovalListEnv) {
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
