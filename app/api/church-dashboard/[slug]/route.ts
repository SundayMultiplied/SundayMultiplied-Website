import { env } from "cloudflare:workers";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const DASHBOARD_ACCESS_ERROR = "This dashboard isn't available for your account. Check the link or contact Sunday Multiplied if you believe you should have access.";
const ACTIVE_REVIEW_STATUSES = new Set(["ready_for_review", "viewed", "revised"]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await context.params;
  const slug = rawSlug.trim().toLowerCase();
  const requestHeaders = await headers();
  const email = accessIdentityEmail(requestHeaders);

  if (!email) return json({ error: "Unauthorized." }, 401);
  if (!env.DB) return json({ error: "Dashboard database is not configured." }, 503);

  try {
    const church = await env.DB.prepare(
      "SELECT id, name, slug FROM churches WHERE lower(slug) = ? LIMIT 1",
    ).bind(slug).first<{ id: string; name: string; slug: string }>();

    // Deliberately use the same public-facing message for missing and unauthorized
    // churches so the portal does not reveal which church slugs have dashboards.
    if (!church) return json({ error: DASHBOARD_ACCESS_ERROR }, 404);

    const adminEmail = env.APPROVAL_ADMIN_EMAIL?.trim() || "brian@sundaymultiplied.com";
    const isAdmin = email.toLowerCase() === adminEmail.toLowerCase();

    if (!isAdmin && !(await hasChurchReviewAccess(env.DB, church.id, email))) {
      return json({ error: DASHBOARD_ACCESS_ERROR }, 403);
    }

    const packagesResult = await env.DB.prepare(`
      SELECT p.id, p.title, p.series_title AS seriesTitle, p.week_of AS weekOf,
             p.scripture, p.status, p.reviewer_name AS reviewerName,
             p.reviewer_email AS reviewerEmail, p.viewed_at AS viewedAt,
             p.decided_at AS decidedAt, p.created_at AS createdAt,
             p.updated_at AS updatedAt,
             (SELECT COUNT(*) FROM review_resources r WHERE r.package_id = p.id) AS resourceCount
      FROM review_packages p
      WHERE p.church_id = ?
      ORDER BY p.week_of DESC, p.created_at DESC
      LIMIT 50
    `).bind(church.id).all<Record<string, unknown>>();

    const packages = packagesResult.results;
    const packageIds = packages.map((item) => String(item.id || "")).filter(Boolean);
    let resources: Record<string, unknown>[] = [];
    let activity: Record<string, unknown>[] = [];

    if (packageIds.length > 0) {
      const placeholders = packageIds.map(() => "?").join(",");
      const resourcesResult = await env.DB.prepare(`
        SELECT id, package_id AS packageId, kind, title, version,
               preview_url AS previewUrl, sort_order AS sortOrder, created_at AS createdAt
        FROM review_resources
        WHERE package_id IN (${placeholders})
        ORDER BY package_id, sort_order ASC, created_at ASC
      `).bind(...packageIds).all<Record<string, unknown>>();
      resources = resourcesResult.results;

      const activityResult = await env.DB.prepare(`
        SELECT a.id, a.package_id AS packageId, a.event_type AS eventType,
               a.actor_name AS actorName, a.details, a.created_at AS createdAt,
               p.title AS packageTitle, p.week_of AS weekOf
        FROM review_activity a
        JOIN review_packages p ON p.id = a.package_id
        WHERE p.church_id = ?
        ORDER BY a.created_at DESC
        LIMIT 30
      `).bind(church.id).all<Record<string, unknown>>();
      activity = activityResult.results.map((item) => ({ ...item, details: parseDetails(item.details) }));
    }

    const resourcesByPackage = new Map<string, Record<string, unknown>[]>();
    for (const resource of resources) {
      const packageId = String(resource.packageId || "");
      const items = resourcesByPackage.get(packageId) || [];
      items.push(resource);
      resourcesByPackage.set(packageId, items);
    }

    const packagesWithResources = packages.map((item) => ({
      ...item,
      resources: resourcesByPackage.get(String(item.id || "")) || [],
    }));

    const currentPackage = packagesWithResources[0] || null;
    let canReviewCurrent = false;
    if (currentPackage && ACTIVE_REVIEW_STATUSES.has(String(currentPackage.status || ""))) {
      const assignedEmail = await assignedReviewerEmail(
        env.DB,
        String(currentPackage.id || ""),
        String(currentPackage.reviewerEmail || ""),
      );
      canReviewCurrent = Boolean(assignedEmail && assignedEmail.toLowerCase() === email.toLowerCase());
    }

    return json({
      church,
      viewer: { email, isAdmin },
      currentPackage,
      canReviewCurrent,
      packages: packagesWithResources,
      activity,
    });
  } catch (error) {
    console.error("church_dashboard_query_failed", error);
    return json({ error: "Unable to load the church dashboard." }, 500);
  }
}

async function hasChurchReviewAccess(db: D1Database, churchId: string, email: string) {
  const normalized = email.toLowerCase();
  const direct = await db.prepare(`
    SELECT id
    FROM review_packages
    WHERE church_id = ? AND lower(reviewer_email) = ?
    LIMIT 1
  `).bind(churchId, normalized).first<{ id: string }>();
  if (direct) return true;

  const notifications = await db.prepare(`
    SELECT a.details
    FROM review_activity a
    JOIN review_packages p ON p.id = a.package_id
    WHERE p.church_id = ? AND a.event_type LIKE 'review_ready_notification_%'
    ORDER BY a.created_at DESC
    LIMIT 100
  `).bind(churchId).all<{ details: string | null }>();

  return notifications.results.some((item) => notificationRecipient(item.details).toLowerCase() === normalized);
}

async function assignedReviewerEmail(db: D1Database, packageId: string, persistedReviewerEmail: string) {
  if (persistedReviewerEmail.trim()) return persistedReviewerEmail.trim();
  const notification = await db.prepare(`
    SELECT details
    FROM review_activity
    WHERE package_id = ? AND event_type LIKE 'review_ready_notification_%'
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(packageId).first<{ details: string | null }>();
  return notificationRecipient(notification?.details || "");
}

function notificationRecipient(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  try {
    const parsed = JSON.parse(value) as { recipient?: unknown };
    return typeof parsed.recipient === "string" ? parsed.recipient.trim() : "";
  } catch {
    return "";
  }
}

function accessIdentityEmail(requestHeaders: Headers) {
  return (requestHeaders.get("cf-access-authenticated-user-email")
    ?? requestHeaders.get("oai-authenticated-user-email")
    ?? "").trim();
}

function parseDetails(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
