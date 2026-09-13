type FamilyWorshipOverrideEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
};

type ReviewPackageRow = {
  id: string;
  status: string | null;
};

type FamilyResourceRow = {
  id: string;
  kind: string;
  storageKey: string | null;
  previewUrl: string | null;
};

type WorshipOverrideRow = {
  recommendedUrl: string | null;
  recommendedLabel: string | null;
  selectedUrl: string | null;
  selectedLabel: string | null;
  sourceStorageKey: string | null;
  active: number;
};

type WorshipState = {
  resourceId: string;
  active: boolean;
  recommendedUrl: string;
  recommendedLabel: string;
  selectedUrl: string;
  selectedLabel: string;
  canEdit: boolean;
};

const ACTIVE_REVIEW_STATUSES = new Set(["ready_for_review", "viewed", "revised"]);
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export async function handleFamilyWorshipOverrideApi(
  request: Request,
  env: FamilyWorshipOverrideEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/reviews\/([^/]+)\/resource\/([^/]+)\/worship$/);
  if (!match) return null;
  if (!env.DB) return json({ error: "Approval database is not configured." }, 503);
  if (!env.BUCKET) return json({ error: "Resource storage is not configured." }, 503);

  const token = decodeURIComponent(match[1]);
  const resourceId = decodeURIComponent(match[2]);
  const tokenHash = await sha256(token);
  const reviewPackage = await env.DB.prepare(
    "SELECT id, status FROM review_packages WHERE token_hash = ? LIMIT 1",
  ).bind(tokenHash).first<ReviewPackageRow>();
  if (!reviewPackage) return json({ error: "This review link is invalid or has expired." }, 404);

  const resource = await env.DB.prepare(`
    SELECT id, kind, storage_key AS storageKey, preview_url AS previewUrl
    FROM review_resources
    WHERE id = ? AND package_id = ?
    LIMIT 1
  `).bind(resourceId, reviewPackage.id).first<FamilyResourceRow>();
  if (!resource || !resource.kind.toLowerCase().includes("family")) {
    return json({ error: "Family Multiplied resource not found." }, 404);
  }

  const sourceStorageKey = resourceStorageKey(resource);
  if (!sourceStorageKey) {
    return json({ error: "The Family Multiplied source file is not available for customization." }, 409);
  }

  await ensureWorshipOverrideSchema(env.DB);
  const canEdit = ACTIVE_REVIEW_STATUSES.has(reviewPackage.status || "");

  if (request.method === "GET") {
    return json(await readWorshipState(env, reviewPackage.id, resource, sourceStorageKey, canEdit));
  }

  if (!["POST", "DELETE"].includes(request.method)) return json({ error: "Method not allowed." }, 405);
  if (!canEdit) return json({ error: "The worship song can only be changed while this resource is awaiting review." }, 409);

  if (request.method === "DELETE") {
    return restoreRecommendation(env, reviewPackage.id, resource, sourceStorageKey);
  }

  let body: { url?: unknown };
  try {
    body = await request.json() as { url?: unknown };
  } catch {
    return json({ error: "Enter a valid YouTube link." }, 400);
  }

  const selectedUrl = normalizeYouTubeUrl(body.url);
  if (!selectedUrl) {
    return json({ error: "Paste a valid YouTube link from youtube.com or youtu.be." }, 400);
  }

  return applyOverride(env, reviewPackage.id, resource, sourceStorageKey, selectedUrl);
}

async function applyOverride(
  env: FamilyWorshipOverrideEnv & { DB?: D1Database; BUCKET?: R2Bucket },
  packageId: string,
  resource: FamilyResourceRow,
  sourceStorageKey: string,
  selectedUrl: string,
) {
  const db = env.DB!;
  const bucket = env.BUCKET!;
  const current = await bucket.get(sourceStorageKey);
  if (!current) return json({ error: "The Family Multiplied source file could not be loaded." }, 404);

  const backupKey = recommendationBackupKey(sourceStorageKey);
  let recommendationObject = await bucket.get(backupKey);
  if (!recommendationObject) {
    const originalHtml = await new Response(current.body).text();
    await bucket.put(backupKey, originalHtml, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
    recommendationObject = await bucket.get(backupKey);
  }
  if (!recommendationObject) return json({ error: "The original worship recommendation could not be preserved." }, 500);

  const recommendedHtml = await new Response(recommendationObject.body).text();
  const recommendation = extractWorshipRecommendation(recommendedHtml);
  if (!recommendation.url) {
    return json({ error: "The Family resource does not contain a recognizable worship recommendation." }, 409);
  }

  const selectedLabel = await resolveYouTubeLabel(selectedUrl);
  const updatedHtml = replaceWorshipSelection(recommendedHtml, selectedUrl, selectedLabel);
  if (!updatedHtml) {
    return json({ error: "The Family worship section could not be updated safely." }, 409);
  }

  await bucket.put(sourceStorageKey, updatedHtml, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`
      INSERT INTO review_worship_overrides
        (resource_id, package_id, recommended_url, recommended_label, selected_url, selected_label,
         source_storage_key, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(resource_id) DO UPDATE SET
        package_id = excluded.package_id,
        recommended_url = excluded.recommended_url,
        recommended_label = excluded.recommended_label,
        selected_url = excluded.selected_url,
        selected_label = excluded.selected_label,
        source_storage_key = excluded.source_storage_key,
        active = 1,
        updated_at = excluded.updated_at
    `).bind(
      resource.id,
      packageId,
      recommendation.url,
      recommendation.label || "Sunday Multiplied recommendation",
      selectedUrl,
      selectedLabel,
      sourceStorageKey,
      now,
      now,
    ),
    db.prepare(`
      INSERT INTO review_activity (id, package_id, event_type, details, created_at)
      VALUES (?, ?, 'family_worship_overridden', ?, ?)
    `).bind(
      crypto.randomUUID(),
      packageId,
      JSON.stringify({ resourceId: resource.id, selectedUrl, selectedLabel }),
      now,
    ),
  ]);

  return json({
    resourceId: resource.id,
    active: true,
    recommendedUrl: recommendation.url,
    recommendedLabel: recommendation.label || "Sunday Multiplied recommendation",
    selectedUrl,
    selectedLabel,
    canEdit: true,
  } satisfies WorshipState);
}

async function restoreRecommendation(
  env: FamilyWorshipOverrideEnv & { DB?: D1Database; BUCKET?: R2Bucket },
  packageId: string,
  resource: FamilyResourceRow,
  sourceStorageKey: string,
) {
  const db = env.DB!;
  const bucket = env.BUCKET!;
  const backupKey = recommendationBackupKey(sourceStorageKey);
  const backup = await bucket.get(backupKey);
  if (!backup) {
    const state = await readWorshipState(env, packageId, resource, sourceStorageKey, true);
    if (!state.active) return json(state);
    return json({ error: "The original worship recommendation is no longer available to restore." }, 409);
  }

  const originalHtml = await new Response(backup.body).text();
  await bucket.put(sourceStorageKey, originalHtml, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
  const recommendation = extractWorshipRecommendation(originalHtml);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`
      UPDATE review_worship_overrides
      SET active = 0, selected_url = NULL, selected_label = NULL, updated_at = ?
      WHERE resource_id = ? AND package_id = ?
    `).bind(now, resource.id, packageId),
    db.prepare(`
      INSERT INTO review_activity (id, package_id, event_type, details, created_at)
      VALUES (?, ?, 'family_worship_restored', ?, ?)
    `).bind(crypto.randomUUID(), packageId, JSON.stringify({ resourceId: resource.id }), now),
  ]);

  return json({
    resourceId: resource.id,
    active: false,
    recommendedUrl: recommendation.url,
    recommendedLabel: recommendation.label || "Sunday Multiplied recommendation",
    selectedUrl: "",
    selectedLabel: "",
    canEdit: true,
  } satisfies WorshipState);
}

async function readWorshipState(
  env: FamilyWorshipOverrideEnv & { DB?: D1Database; BUCKET?: R2Bucket },
  packageId: string,
  resource: FamilyResourceRow,
  sourceStorageKey: string,
  canEdit: boolean,
): Promise<WorshipState> {
  const db = env.DB!;
  const bucket = env.BUCKET!;
  const override = await db.prepare(`
    SELECT recommended_url AS recommendedUrl, recommended_label AS recommendedLabel,
           selected_url AS selectedUrl, selected_label AS selectedLabel,
           source_storage_key AS sourceStorageKey, active
    FROM review_worship_overrides
    WHERE resource_id = ? AND package_id = ?
    LIMIT 1
  `).bind(resource.id, packageId).first<WorshipOverrideRow>();

  const backup = await bucket.get(recommendationBackupKey(sourceStorageKey));
  const source = backup || await bucket.get(sourceStorageKey);
  let recommendation = { url: override?.recommendedUrl || "", label: override?.recommendedLabel || "" };
  if (source) {
    const html = await new Response(source.body).text();
    const extracted = extractWorshipRecommendation(html);
    if (extracted.url) recommendation = extracted;
  }

  const active = Boolean(override?.active && override.sourceStorageKey === sourceStorageKey && override.selectedUrl);
  return {
    resourceId: resource.id,
    active,
    recommendedUrl: recommendation.url,
    recommendedLabel: recommendation.label || "Sunday Multiplied recommendation",
    selectedUrl: active ? override?.selectedUrl || "" : "",
    selectedLabel: active ? override?.selectedLabel || "Pastor-selected worship song" : "",
    canEdit,
  };
}

async function ensureWorshipOverrideSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS review_worship_overrides (
      resource_id TEXT PRIMARY KEY NOT NULL,
      package_id TEXT NOT NULL,
      recommended_url TEXT,
      recommended_label TEXT,
      selected_url TEXT,
      selected_label TEXT,
      source_storage_key TEXT,
      active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS review_worship_overrides_package_idx ON review_worship_overrides(package_id)"),
  ]);
}

function resourceStorageKey(resource: FamilyResourceRow) {
  if (resource.storageKey) return resource.storageKey;
  const match = resource.previewUrl?.match(/\/api\/production\/preview\/([^/]+)\/family(?:$|[?#])/i);
  return match ? `production/jobs/${match[1]}/family.html` : "";
}

function recommendationBackupKey(sourceStorageKey: string) {
  return sourceStorageKey.replace(/\.html$/i, "") + ".worship-recommended.html";
}

function extractWorshipRecommendation(html: string) {
  const section = html.match(/<section\b[^>]*class=(['"])[^'"]*sm-section--worship[^'"]*\1[^>]*>[\s\S]*?<\/section>/i)?.[0] || "";
  if (!section) return { url: "", label: "" };
  const url = decodeHtmlAttribute(section.match(/<a\b[^>]*class=(['"])[^'"]*sm-worship-link[^'"]*\1[^>]*href=(['"])(.*?)\2/i)?.[3] || "");
  const labelHtml = section.match(/<p\b[^>]*class=(['"])[^'"]*sm-worship-song[^'"]*\1[^>]*>([\s\S]*?)<\/p>/i)?.[2] || "";
  const label = decodeHtmlText(labelHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  return { url, label };
}

function replaceWorshipSelection(html: string, selectedUrl: string, selectedLabel: string) {
  const sectionPattern = /<section\b[^>]*class=(['"])[^'"]*sm-section--worship[^'"]*\1[^>]*>[\s\S]*?<\/section>/i;
  const section = html.match(sectionPattern)?.[0];
  if (!section) return "";

  let updated = section;
  const safeLabel = escapeHtml(selectedLabel || "Pastor-selected worship song");
  const songPattern = /(<p\b[^>]*class=(['"])[^'"]*sm-worship-song[^'"]*\2[^>]*>)[\s\S]*?(<\/p>)/i;
  if (songPattern.test(updated)) updated = updated.replace(songPattern, `$1${safeLabel}$3`);

  const connectionPattern = /(<p\b[^>]*class=(['"])[^'"]*sm-worship-connection[^'"]*\2[^>]*>)[\s\S]*?(<\/p>)/i;
  if (connectionPattern.test(updated)) {
    updated = updated.replace(connectionPattern, "$1Selected by your church for this week's Family Multiplied resource.$3");
  }

  const linkPattern = /(<a\b[^>]*class=(['"])[^'"]*sm-worship-link[^'"]*\2[^>]*href=)(['"])(.*?)\3([^>]*>)[\s\S]*?(<\/a>)/i;
  if (!linkPattern.test(updated)) return "";
  updated = updated.replace(linkPattern, `$1$3${escapeHtmlAttribute(selectedUrl)}$3$5Play selected song on YouTube$6`);
  return html.replace(sectionPattern, updated);
}

function normalizeYouTubeUrl(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 1000) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const allowed = host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtu.be";
    if (!allowed) return "";
    if (host === "youtu.be" && !url.pathname.replace(/\//g, "")) return "";
    if (host !== "youtu.be" && url.pathname === "/watch" && !url.searchParams.get("v")) return "";
    url.protocol = "https:";
    url.hash = "";
    for (const key of ["si", "feature", "pp", "utm_source", "utm_medium", "utm_campaign"]) url.searchParams.delete(key);
    return url.toString();
  } catch {
    return "";
  }
}

async function resolveYouTubeLabel(url: string) {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return "Pastor-selected worship song";
    const data = await response.json() as { title?: unknown; author_name?: unknown };
    const title = cleanText(data.title, 160);
    const author = cleanText(data.author_name, 120);
    return [title, author].filter(Boolean).join(" — ") || "Pastor-selected worship song";
  } catch {
    return "Pastor-selected worship song";
  }
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function decodeHtmlAttribute(value: string) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
}

function decodeHtmlText(value: string) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
}
