import type { CanonicalSermonAnalysis } from "./sermon-analysis";
import type { ProductionEnv, ProductionManifest } from "./production-api";

export type AnalysisReviewFeedback = {
  id: string;
  reviewerName: string;
  assessment: "accurate" | "questions" | "changes_requested";
  notes: string;
  createdAt: string;
};

type AnalysisShareRecord = {
  token: string;
  jobId: string;
  churchName: string;
  sermonTitle: string;
  weekOf: string;
  createdAt: string;
  createdBy: string;
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow, noarchive",
};

export async function handleAnalysisReviewApi(request: Request, env: ProductionEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const createMatch = url.pathname.match(/^\/api\/production\/jobs\/([^/]+)\/analysis\/share$/);
  const publicMatch = url.pathname.match(/^\/api\/analysis-reviews\/([A-Za-z0-9_-]{32,100})$/);
  const feedbackMatch = url.pathname.match(/^\/api\/analysis-reviews\/([A-Za-z0-9_-]{32,100})\/feedback$/);

  if (createMatch && request.method === "POST") return createAnalysisShare(request, env, createMatch[1]);
  if (publicMatch && request.method === "GET") return getSharedAnalysis(env, publicMatch[1]);
  if (feedbackMatch && request.method === "POST") return saveFeedback(request, env, feedbackMatch[1]);
  return null;
}

async function createAnalysisShare(request: Request, env: ProductionEnv, jobId: string) {
  if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
  const authError = adminAuthorizationError(request, env);
  if (authError) return json({ error: authError }, 401);
  const manifest = await loadProductionManifest(env.BUCKET, jobId);
  if (!manifest) return json({ error: "Production job not found." }, 404);
  if (!manifest.analysisStorageKey || !await env.BUCKET.head(manifest.analysisStorageKey)) {
    return json({ error: "Sermon analysis is unavailable for this production job." }, 404);
  }

  if (manifest.analysisReviewId && manifest.analysisReviewUrl) {
    return json({ ok: true, reviewUrl: manifest.analysisReviewUrl });
  }

  const token = randomToken();
  const origin = env.PUBLIC_SITE_ORIGIN?.trim() || "https://sundaymultiplied.com";
  const reviewUrl = `${origin}/analysis-review/${token}`;
  const record: AnalysisShareRecord = {
    token,
    jobId: manifest.id,
    churchName: manifest.churchName,
    sermonTitle: manifest.metadata.sermonTitle || "Sermon analysis",
    weekOf: manifest.weekOf,
    createdAt: new Date().toISOString(),
    createdBy: accessIdentityEmail(request),
  };
  await env.BUCKET.put(shareKey(token), JSON.stringify(record, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  manifest.analysisReviewId = token;
  manifest.analysisReviewUrl = reviewUrl;
  await saveProductionManifest(env.BUCKET, manifest);
  return json({ ok: true, reviewUrl }, 201);
}

async function getSharedAnalysis(env: ProductionEnv, token: string) {
  if (!env.BUCKET) return json({ error: "Analysis review storage is unavailable." }, 503);
  const record = await loadShare(env.BUCKET, token);
  if (!record) return json({ error: "Analysis review link not found." }, 404);
  const manifest = await loadProductionManifest(env.BUCKET, record.jobId);
  if (!manifest?.analysisStorageKey || manifest.analysisReviewId !== token) {
    return json({ error: "This analysis review link is no longer active." }, 410);
  }
  const object = await env.BUCKET.get(manifest.analysisStorageKey);
  if (!object) return json({ error: "Sermon analysis is unavailable." }, 404);
  let analysis: CanonicalSermonAnalysis;
  try { analysis = await object.json<CanonicalSermonAnalysis>(); }
  catch { return json({ error: "Sermon analysis is invalid." }, 500); }
  return json({
    analysis,
    job: {
      id: manifest.id,
      churchName: manifest.churchName,
      weekOf: manifest.weekOf,
      status: manifest.status,
    },
  });
}

async function saveFeedback(request: Request, env: ProductionEnv, token: string) {
  if (!env.BUCKET) return json({ error: "Analysis review storage is unavailable." }, 503);
  const record = await loadShare(env.BUCKET, token);
  if (!record) return json({ error: "Analysis review link not found." }, 404);
  const manifest = await loadProductionManifest(env.BUCKET, record.jobId);
  if (!manifest || manifest.analysisReviewId !== token) return json({ error: "This analysis review link is no longer active." }, 410);
  const body = await request.json().catch(() => ({})) as { reviewerName?: string; assessment?: string; notes?: string };
  const assessment = clean(body.assessment || "", 30);
  if (!["accurate", "questions", "changes_requested"].includes(assessment)) {
    return json({ error: "Choose an assessment of the sermon analysis." }, 400);
  }
  const notes = clean(body.notes || "", 4000);
  if (assessment !== "accurate" && !notes) return json({ error: "Add a note explaining your questions or requested changes." }, 400);
  const feedback: AnalysisReviewFeedback = {
    id: crypto.randomUUID(),
    reviewerName: clean(body.reviewerName || "Anonymous reviewer", 100),
    assessment: assessment as AnalysisReviewFeedback["assessment"],
    notes,
    createdAt: new Date().toISOString(),
  };
  await env.BUCKET.put(feedbackKey(token, feedback.id), JSON.stringify(feedback, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  return json({ ok: true });
}

export async function loadAnalysisReviewFeedback(bucket: R2Bucket, token: string | undefined) {
  if (!token) return [];
  const listed = await bucket.list({ prefix: `production/analysis-reviews/${token}/feedback/`, limit: 100 });
  const feedback: AnalysisReviewFeedback[] = [];
  for (const item of listed.objects) {
    const object = await bucket.get(item.key);
    if (!object) continue;
    try { feedback.push(await object.json<AnalysisReviewFeedback>()); } catch { /* Ignore malformed feedback. */ }
  }
  return feedback.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function loadShare(bucket: R2Bucket, token: string) {
  const object = await bucket.get(shareKey(token));
  if (!object) return null;
  try { return await object.json<AnalysisShareRecord>(); } catch { return null; }
}

async function loadProductionManifest(bucket: R2Bucket, jobId: string) {
  const object = await bucket.get(`production/manifests/${jobId}.json`);
  if (!object) return null;
  try { return await object.json<ProductionManifest>(); } catch { return null; }
}

async function saveProductionManifest(bucket: R2Bucket, manifest: ProductionManifest) {
  await bucket.put(`production/manifests/${manifest.id}.json`, JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

function shareKey(token: string) { return `production/analysis-review-manifests/${token}.json`; }
function feedbackKey(token: string, id: string) { return `production/analysis-reviews/${token}/feedback/${id}.json`; }
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function clean(value: string, max: number) { return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max); }
function adminAuthorizationError(request: Request, env: ProductionEnv) {
  const email = accessIdentityEmail(request);
  const adminEmail = env.APPROVAL_ADMIN_EMAIL?.trim() || "brian@sundaymultiplied.com";
  return !email || email.toLowerCase() !== adminEmail.toLowerCase() ? "Unauthorized." : "";
}
function accessIdentityEmail(request: Request) {
  const headerEmail = request.headers.get("cf-access-authenticated-user-email") ?? request.headers.get("oai-authenticated-user-email");
  if (headerEmail) return headerEmail.trim();
  const payload = request.headers.get("cf-access-jwt-assertion")?.split(".")[1];
  if (!payload) return "";
  try {
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(base64)) as { email?: unknown };
    return typeof claims.email === "string" ? claims.email.trim() : "";
  } catch { return ""; }
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
