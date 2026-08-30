import { ensurePackageArchiveSchema, finalizeApprovedPackage } from "./package-finalization";

type PackageFinalizationApiEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  APPROVAL_ADMIN_EMAIL?: string;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export async function handlePackageFinalizationApi(
  request: Request,
  env: PackageFinalizationApiEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  const packageMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)\/finalize$/);
  const backfill = url.pathname === "/api/approvals/finalize-approved";
  if (request.method !== "POST" || (!packageMatch && !backfill)) return null;

  if (!env.DB || !env.BUCKET) return json({ error: "Archive storage is not configured." }, 503);
  const authError = adminAuthorizationError(request, env);
  if (authError) return json({ error: authError }, 401);
  await ensurePackageArchiveSchema(env.DB);

  if (packageMatch) {
    const packageId = decodeURIComponent(packageMatch[1]);
    const pkg = await env.DB.prepare("SELECT status FROM review_packages WHERE id = ? LIMIT 1")
      .bind(packageId).first<{ status: string }>();
    if (!pkg) return json({ error: "Approval package not found." }, 404);
    if (pkg.status !== "approved") return json({ error: "Only fully approved packages can be finalized." }, 409);
    const result = await finalizeApprovedPackage(env, packageId);
    return json({ ok: result.status === "archived", ...result }, result.status === "archived" ? 200 : 502);
  }

  const packages = await env.DB.prepare(`
    SELECT p.id
    FROM review_packages p
    LEFT JOIN review_package_archives a ON a.package_id = p.id
    WHERE p.status = 'approved' AND (a.status IS NULL OR a.status != 'archived')
    ORDER BY p.updated_at ASC
    LIMIT 25
  `).all<{ id: string }>();

  const results = [];
  for (const pkg of packages.results) {
    const result = await finalizeApprovedPackage(env, pkg.id);
    results.push({ packageId: pkg.id, ...result });
  }
  return json({
    ok: results.every((item) => item.status === "archived"),
    processed: results.length,
    results,
  }, results.some((item) => item.status === "failed") ? 207 : 200);
}

function adminAuthorizationError(request: Request, env: PackageFinalizationApiEnv) {
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
