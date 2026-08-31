type SystemHealthEnv = {
  BREVO_API_KEY?: string;
  APPROVAL_ADMIN_EMAIL?: string;
  CF_VERSION_METADATA?: { id?: string; tag?: string; timestamp?: string };
  DEPLOYMENT_VERSION?: string;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export async function handleSystemHealthApi(request: Request, env: SystemHealthEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/admin/system-health" || request.method !== "GET") return null;
  const authError = adminAuthorizationError(request, env);
  if (authError) return json({ error: authError }, 401);

  const checkedAt = new Date().toISOString();
  const [github, brevo] = await Promise.all([checkGithub(), checkBrevo(env)]);
  const deploymentId = env.CF_VERSION_METADATA?.id || env.CF_VERSION_METADATA?.tag || env.DEPLOYMENT_VERSION || "";

  return json({
    checkedAt,
    github,
    cloudflare: {
      status: "operational",
      label: "Worker responding",
      deployment: deploymentId || null,
      deploymentTimestamp: env.CF_VERSION_METADATA?.timestamp || null,
      detail: deploymentId ? "Current Worker deployment metadata is available." : "Current Worker is healthy; deployment metadata is not exposed by this runtime yet.",
    },
    brevo,
    youtubeListener: {
      status: "not_configured",
      label: "Not connected",
      detail: "Listener health will appear here when the YouTube listener service is reconnected.",
    },
  });
}

async function checkGithub() {
  try {
    const response = await fetch("https://api.github.com/repos/SundayMultiplied/SundayMultiplied-Website/pulls?state=all&sort=created&direction=desc&per_page=1", {
      headers: { "user-agent": "Sunday-Multiplied-Admin-Health", accept: "application/vnd.github+json" },
    });
    if (!response.ok) return { status: "degraded", label: "GitHub unavailable", detail: `GitHub returned ${response.status}.`, latestPr: null };
    const rows = await response.json() as Array<{ number: number; title: string; state: string; merged_at?: string | null; html_url: string; updated_at?: string }>;
    const pr = rows[0];
    return {
      status: "operational",
      label: "Connected",
      detail: pr ? `Latest PR #${pr.number}: ${pr.title}` : "Repository reachable; no pull requests found.",
      latestPr: pr ? { number: pr.number, title: pr.title, state: pr.merged_at ? "merged" : pr.state, url: pr.html_url, updatedAt: pr.updated_at || null } : null,
    };
  } catch (error) {
    return { status: "degraded", label: "GitHub unavailable", detail: error instanceof Error ? error.message : "GitHub request failed.", latestPr: null };
  }
}

async function checkBrevo(env: SystemHealthEnv) {
  if (!env.BREVO_API_KEY) return { status: "not_configured", label: "API key missing", detail: "BREVO_API_KEY is not configured." };
  try {
    const response = await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": env.BREVO_API_KEY, accept: "application/json" } });
    if (!response.ok) return { status: "degraded", label: "Brevo error", detail: `Brevo returned ${response.status}.` };
    const account = await response.json() as { email?: string; companyName?: string };
    return { status: "operational", label: "Connected", detail: account.companyName || account.email || "Brevo account responded successfully." };
  } catch (error) {
    return { status: "degraded", label: "Brevo unavailable", detail: error instanceof Error ? error.message : "Brevo request failed." };
  }
}

function adminAuthorizationError(request: Request, env: SystemHealthEnv) {
  const email = accessIdentityEmail(request);
  const adminEmail = env.APPROVAL_ADMIN_EMAIL?.trim() || "brian@sundaymultiplied.com";
  if (!email || email.toLowerCase() !== adminEmail.toLowerCase()) return "Unauthorized.";
  return "";
}

function accessIdentityEmail(request: Request) {
  const headerEmail = request.headers.get("cf-access-authenticated-user-email") ?? request.headers.get("oai-authenticated-user-email");
  if (headerEmail) return headerEmail.trim();
  const assertion = request.headers.get("cf-access-jwt-assertion");
  const payload = assertion?.split(".")[1];
  if (!payload) return "";
  try {
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(base64)) as { email?: unknown };
    return typeof claims.email === "string" ? claims.email.trim() : "";
  } catch { return ""; }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
