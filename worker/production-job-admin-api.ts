type ProductionJobAdminEnv = {
  BUCKET?: R2Bucket;
  APPROVAL_ADMIN_EMAIL?: string;
};

type ProductionManifestSummary = {
  status?: "ready_for_internal_review" | "sent_for_approval";
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export async function handleProductionJobAdminApi(request: Request, env: ProductionJobAdminEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/production\/jobs\/([^/]+)$/);
  if (!match || request.method !== "DELETE") return null;

  if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
  const authError = adminAuthorizationError(request, env);
  if (authError) return json({ error: authError }, 401);

  const jobId = decodeURIComponent(match[1]).trim();
  if (!/^[a-zA-Z0-9-]{20,80}$/.test(jobId)) return json({ error: "Invalid production job ID." }, 400);

  const manifestKey = `production/manifests/${jobId}.json`;
  const manifestObject = await env.BUCKET.get(manifestKey);
  if (!manifestObject) return json({ error: "Production job not found." }, 404);

  let manifest: ProductionManifestSummary = {};
  try { manifest = await manifestObject.json<ProductionManifestSummary>(); } catch { /* malformed manifests can still be cleaned up */ }
  if (manifest.status === "sent_for_approval") {
    return json({ error: "This production job is linked to an approval package and cannot be deleted yet." }, 409);
  }

  const prefix = `production/jobs/${jobId}/`;
  let cursor: string | undefined;
  do {
    const listed = await env.BUCKET.list({ prefix, cursor, limit: 1000 });
    const keys = listed.objects.map((object) => object.key);
    if (keys.length) await env.BUCKET.delete(keys);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  await env.BUCKET.delete(manifestKey);
  return json({ ok: true, jobId });
}

function adminAuthorizationError(request: Request, env: ProductionJobAdminEnv) {
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
