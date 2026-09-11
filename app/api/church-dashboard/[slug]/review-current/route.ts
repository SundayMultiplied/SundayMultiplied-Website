import { env } from "cloudflare:workers";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const ACTIVE_REVIEW_STATUSES = new Set(["ready_for_review", "viewed", "revised"]);
const DEFAULT_PUBLIC_ORIGIN = "https://www.sundaymultiplied.com";
const MANIFEST_PREFIX = "production/manifests/";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await context.params;
  const slug = rawSlug.trim().toLowerCase();
  const requestHeaders = await headers();
  const email = accessIdentityEmail(requestHeaders);

  if (!email) return message("You must be signed in to open this review.", 401);
  if (!env.DB || !env.BUCKET) return message("The review service is temporarily unavailable.", 503);

  const reviewPackage = await env.DB.prepare(`
    SELECT p.id, p.status, p.reviewer_email AS reviewerEmail
    FROM review_packages p
    JOIN churches c ON c.id = p.church_id
    WHERE lower(c.slug) = ?
    ORDER BY p.week_of DESC, p.created_at DESC
    LIMIT 1
  `).bind(slug).first<{ id: string; status: string; reviewerEmail: string | null }>();

  if (!reviewPackage) return message("There is no current review package for this church.", 404);
  if (!ACTIVE_REVIEW_STATUSES.has(reviewPackage.status)) {
    return message("This package does not currently need a review.", 409);
  }

  const assignedEmail = await assignedReviewerEmail(env.DB, reviewPackage.id, reviewPackage.reviewerEmail || "");
  if (!assignedEmail || assignedEmail.toLowerCase() !== email.toLowerCase()) {
    return message("This review is assigned to another reviewer.", 403);
  }

  const storedReviewUrl = await findReviewUrl(env.BUCKET, reviewPackage.id);
  if (!storedReviewUrl) {
    return message("The secure review link could not be located. Please use the review email or contact Sunday Multiplied.", 404);
  }

  const destination = safeReviewDestination(storedReviewUrl, request.url, env.PUBLIC_SITE_ORIGIN);
  if (!destination) {
    console.error("church_dashboard_review_redirect_invalid", { packageId: reviewPackage.id });
    return message("The secure review link is unavailable. Please contact Sunday Multiplied.", 500);
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: destination,
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
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

async function findReviewUrl(bucket: R2Bucket, reviewPackageId: string) {
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const listing = await bucket.list({ prefix: MANIFEST_PREFIX, cursor, limit: 1000 });
    for (const object of listing.objects) {
      if (!object.key.endsWith(".json")) continue;
      const stored = await bucket.get(object.key);
      if (!stored) continue;
      try {
        const manifest = await stored.json<{ reviewPackageId?: unknown; reviewUrl?: unknown }>();
        if (manifest.reviewPackageId === reviewPackageId && typeof manifest.reviewUrl === "string" && manifest.reviewUrl.trim()) {
          return manifest.reviewUrl.trim();
        }
      } catch {
        // Ignore unrelated or malformed manifests; they cannot authorize a redirect.
      }
    }
    if (!listing.truncated || !listing.cursor) break;
    cursor = listing.cursor;
  }
  return "";
}

function safeReviewDestination(storedReviewUrl: string, requestUrl: string, configuredOrigin?: string) {
  try {
    const publicOrigin = new URL(configuredOrigin?.trim() || DEFAULT_PUBLIC_ORIGIN).origin;
    const requestOrigin = new URL(requestUrl).origin;
    const destination = new URL(storedReviewUrl, publicOrigin);
    if (destination.protocol !== "https:") return "";
    if (![publicOrigin, requestOrigin].includes(destination.origin)) return "";
    if (!/^\/review\/[^/]+\/?$/.test(destination.pathname)) return "";
    destination.search = "";
    destination.hash = "";
    return destination.toString();
  } catch {
    return "";
  }
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

function message(text: string, status: number) {
  return new Response(text, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
