type ProductionEnv = {
  ASSETS?: Fetcher;
  BUCKET?: R2Bucket;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  PUBLIC_SITE_ORIGIN?: string;
  APPROVAL_ADMIN_EMAIL?: string;
};

type ChurchConfig = {
  slug: string;
  name: string;
  resources: Array<"monday" | "group" | "family">;
  baseCssUrl: string;
  cssUrl: string;
  logoUrl?: string;
  reviewerEmail?: string;
};

type GeneratedPackage = {
  metadata: {
    sermonTitle: string;
    seriesTitle: string;
    scripture: string;
    speaker: string;
    confidence: "high" | "medium" | "low";
  };
  resources: {
    monday?: string;
    group?: string;
    family?: string;
  };
};

type ProductionManifest = {
  id: string;
  churchSlug: string;
  churchName: string;
  weekOf: string;
  createdAt: string;
  status: "ready_for_internal_review" | "sent_for_approval";
  sourceFilename: string;
  metadata: GeneratedPackage["metadata"];
  resources: Array<{ kind: string; title: string; storageKey: string; previewUrl: string }>;
  reviewUrl?: string;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const SHARED_RESOURCE_CSS = "/resources/_shared/sunday-multiplied-base.css";

const LEGACY_LOGO_FALLBACKS: Record<string, string> = {
  "sample-church": "/sample-church-logo.webp",
  "southside-baptist": "/resources/southside-baptist/2026-08-09/southside-baptist-logo.png",
};

const CHURCHES: ChurchConfig[] = [
  {
    slug: "sample-church",
    name: "Sample Church",
    resources: ["monday", "group", "family"],
    baseCssUrl: SHARED_RESOURCE_CSS,
    cssUrl: "/resources/sample-church/church.css",
    logoUrl: "/api/resource-assets/sample-church/logo",
  },
  {
    slug: "southside-baptist",
    name: "Southside Baptist Church",
    resources: ["monday", "group", "family"],
    baseCssUrl: SHARED_RESOURCE_CSS,
    cssUrl: "/resources/southside-baptist/church.css",
    logoUrl: "/api/resource-assets/southside-baptist/logo",
  },
];

export async function handleProductionApi(request: Request, env: ProductionEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const previewMatch = url.pathname.match(/^\/api\/production\/preview\/([^/]+)\/(monday|group|family)$/);
  const logoMatch = url.pathname.match(/^\/api\/resource-assets\/([a-z0-9]+(?:-[a-z0-9]+)*)\/logo$/);

  if (logoMatch && request.method === "GET") {
    return serveChurchLogo(request, env, logoMatch[1]);
  }

  if (url.pathname.startsWith("/api/production/") && !previewMatch) {
    const authError = adminAuthorizationError(request, env);
    if (authError) return json({ error: authError }, 401);
  }

  if (url.pathname === "/api/production/churches" && request.method === "GET") {
    return json({ churches: CHURCHES });
  }

  if (url.pathname === "/api/production/jobs" && request.method === "GET") {
    if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
    const listed = await env.BUCKET.list({ prefix: "production/manifests/", limit: 50 });
    const manifests: ProductionManifest[] = [];
    for (const object of listed.objects) {
      const stored = await env.BUCKET.get(object.key);
      if (!stored) continue;
      try { manifests.push(await stored.json<ProductionManifest>()); } catch { /* ignore malformed manifests */ }
    }
    manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ jobs: manifests });
  }

  if (url.pathname === "/api/production/jobs" && request.method === "POST") {
    if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
    if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured for production generation." }, 503);

    let form: FormData;
    try { form = await request.formData(); } catch { return json({ error: "Invalid sermon upload." }, 400); }
    const churchSlug = clean(String(form.get("churchSlug") || ""), 120);
    const weekOf = clean(String(form.get("weekOf") || ""), 10);
    const file = form.get("transcript");
    const church = CHURCHES.find((item) => item.slug === churchSlug);
    if (!church) return json({ error: "Choose a configured church." }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) return json({ error: "Choose a valid sermon date." }, 400);
    if (!(file instanceof File)) return json({ error: "Upload a TXT or VTT sermon transcript." }, 400);
    if (!/\.(txt|vtt)$/i.test(file.name)) return json({ error: "Transcript must be a .txt or .vtt file." }, 400);
    if (file.size > 5_000_000) return json({ error: "Transcript is too large. Maximum upload is 5 MB." }, 413);

    const rawTranscript = await file.text();
    const transcript = normalizeTranscript(rawTranscript, file.name);
    if (transcript.length < 500) return json({ error: "The transcript is too short to generate reliable resources." }, 400);

    let generated: GeneratedPackage;
    try {
      generated = await generateResources(env, church, weekOf, transcript);
    } catch (error) {
      console.error("sermon_resource_generation_failed", error);
      return json({ error: error instanceof Error ? clean(error.message, 500) : "Resource generation failed." }, 502);
    }

    const id = crypto.randomUUID();
    const origin = env.PUBLIC_SITE_ORIGIN || new URL(request.url).origin;
    const resources: ProductionManifest["resources"] = [];

    for (const kind of church.resources) {
      const generatedHtml = generated.resources[kind];
      if (!generatedHtml) continue;
      const html = enforceResourceStyling(generatedHtml, church, kind);
      const storageKey = `production/jobs/${id}/${kind}.html`;
      await env.BUCKET.put(storageKey, html, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
      resources.push({
        kind: titleCase(kind),
        title: `${titleCase(kind)} Multiplied`,
        storageKey,
        previewUrl: `${origin}/api/production/preview/${id}/${kind}`,
      });
    }

    if (resources.length === 0) return json({ error: "No resources were generated." }, 502);
    await env.BUCKET.put(`production/jobs/${id}/transcript.txt`, transcript, { httpMetadata: { contentType: "text/plain; charset=utf-8" } });

    const manifest: ProductionManifest = {
      id,
      churchSlug: church.slug,
      churchName: church.name,
      weekOf,
      createdAt: new Date().toISOString(),
      status: "ready_for_internal_review",
      sourceFilename: file.name,
      metadata: generated.metadata,
      resources,
    };
    await saveManifest(env.BUCKET, manifest);
    return json({ ok: true, job: manifest }, 201);
  }

  if (previewMatch && request.method === "GET") {
    if (!env.BUCKET) return new Response("Production storage is not configured.", { status: 503 });
    const object = await env.BUCKET.get(`production/jobs/${previewMatch[1]}/${previewMatch[2]}.html`);
    if (!object) return new Response("Resource not found.", { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex, nofollow, noarchive",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'",
      },
    });
  }

  const sendMatch = url.pathname.match(/^\/api\/production\/jobs\/([^/]+)\/send$/);
  if (sendMatch && request.method === "POST") {
    if (!env.BUCKET) return json({ error: "Production storage is not configured." }, 503);
    const manifest = await loadManifest(env.BUCKET, sendMatch[1]);
    if (!manifest) return json({ error: "Production job not found." }, 404);
    if (manifest.status === "sent_for_approval" && manifest.reviewUrl) return json({ ok: true, reviewUrl: manifest.reviewUrl });

    const response = await fetch(new URL("/api/approvals", request.url), {
      method: "POST",
      headers: forwardAdminHeaders(request.headers),
      body: JSON.stringify({
        churchName: manifest.churchName,
        churchSlug: manifest.churchSlug,
        title: manifest.metadata.sermonTitle || `${manifest.churchName} sermon resources`,
        seriesTitle: manifest.metadata.seriesTitle,
        weekOf: manifest.weekOf,
        scripture: manifest.metadata.scripture,
        resources: manifest.resources.map((item) => ({ kind: item.kind, title: item.title, previewUrl: item.previewUrl })),
      }),
    });
    const data = await response.json() as { error?: string; reviewUrl?: string };
    if (!response.ok) return json({ error: data.error || "Unable to send this package for approval." }, response.status);
    manifest.status = "sent_for_approval";
    manifest.reviewUrl = data.reviewUrl;
    await saveManifest(env.BUCKET, manifest);
    return json({ ok: true, reviewUrl: data.reviewUrl });
  }

  return null;
}

async function serveChurchLogo(request: Request, env: ProductionEnv, slug: string) {
  if (env.BUCKET) {
    const object = await env.BUCKET.get(`resource-assets/${slug}/primary`);
    if (object) {
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      if (!headers.get("content-type")) headers.set("content-type", "application/octet-stream");
      headers.set("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
      headers.set("x-content-type-options", "nosniff");
      return new Response(object.body, { headers });
    }
  }

  const fallback = LEGACY_LOGO_FALLBACKS[slug];
  if (!fallback || !env.ASSETS) return new Response("Logo not found.", { status: 404 });
  const response = await env.ASSETS.fetch(new Request(new URL(fallback, request.url), { headers: { accept: "image/*" } }));
  if (!response.ok) return new Response("Logo not found.", { status: 404 });
  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
  headers.set("x-content-type-options", "nosniff");
  return new Response(response.body, { status: response.status, headers });
}

async function generateResources(env: ProductionEnv, church: ChurchConfig, weekOf: string, transcript: string): Promise<GeneratedPackage> {
  const resourceList = church.resources.join(", ");
  const prompt = `You are the production engine for Sunday Multiplied. Analyze the attached sermon transcript and create production-ready sermon-based discipleship resources for ${church.name}.

Generate these resources: ${resourceList}.
Sermon date: ${weekOf}.
Shared Sunday Multiplied CSS URL: ${church.baseCssUrl}.
Church brand CSS URL: ${church.cssUrl}.
Church logo URL: ${church.logoUrl || "none"}.

CONTENT RULES:
- Stay faithful to the pastor's actual message. Do not create generic devotional content.
- Extract sermon title, series title, speaker, main Scripture passage, and an overall metadata confidence level. Use an empty string when title/series/speaker cannot be established.
- Monday Multiplied: sermon recap, 3 key takeaways, reflection question, short prayer.
- Group Multiplied: Big Idea, The Tension, Sermon Snapshot, 3-5 Key Moments, 5-7 questions grouped Understand/Reflect/Apply, Practice This Week, Midweek Reinforcement, Leader Tip, Closing Prayer. Include the Scripture reference, but DO NOT fabricate full Bible passage text when exact licensed passage text was not supplied.
- Family Multiplied: a short family dinner-table resource rooted in the sermon with a simple big idea, read/talk section, age-flexible discussion questions, one practical family activity, and a short prayer.

HTML AND STYLING CONTRACT — FOLLOW THIS EXACTLY FOR EVERY RESOURCE:
- Return a complete standalone HTML document with <!doctype html>, <html>, <head>, and <body>.
- Include these two stylesheet links, in this order:
  <link rel="stylesheet" href="${church.baseCssUrl}">
  <link rel="stylesheet" href="${church.cssUrl}">
- Never use inline styles and never invent a separate layout system.
- Body class must be "sm-resource sm-monday", "sm-resource sm-group", or "sm-resource sm-family" as appropriate.
- The page wrapper must be <main class="sm-document">.
- Header must use <header class="sm-header sm-header--with-logo"> containing <div class="sm-header-content">, <div class="sm-header-text">, <p class="sm-eyebrow sm-resource-label">, <h1 class="sm-title">, and <p class="sm-meta">.
- If a logo URL is present, place it inside <div class="sm-header-logo-wrap"> as <img class="sm-church-logo sm-logo" src="${church.logoUrl || ""}" alt="${church.name} logo">.
- Every content section must include class "sm-section" plus an appropriate modifier when one exists.
- Use these established section modifiers where applicable: sm-section--scripture, sm-section--summary, sm-section--takeaways, sm-section--reflection, sm-section--big-idea, sm-section--tension, sm-section--key-moments, sm-section--questions, sm-section--application, sm-section--practice, sm-section--leader-tip, sm-section--parent-note, sm-section--family-remember, sm-section--prayer.
- Scripture references must use class "sm-scripture-reference".
- Group discussion clusters must use <div class="sm-question-group"> with <h3>Understand</h3>, <h3>Reflect</h3>, or <h3>Apply</h3> as appropriate.
- Practice components may use sm-practice-scenario, sm-practice-task, sm-practice-share, and sm-practice-debrief.
- End with <footer class="sm-footer"><p>Sunday Multiplied</p></footer> inside sm-document.
- Do not create alternative classes for the header, document wrapper, sections, question groups, Scripture reference, or footer. The CSS depends on this contract.
- Return only the requested JSON structure.`;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      metadata: {
        type: "object", additionalProperties: false,
        properties: {
          sermonTitle: { type: "string" }, seriesTitle: { type: "string" }, scripture: { type: "string" }, speaker: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["sermonTitle", "seriesTitle", "scripture", "speaker", "confidence"],
      },
      resources: {
        type: "object", additionalProperties: false,
        properties: { monday: { type: "string" }, group: { type: "string" }, family: { type: "string" } },
        required: ["monday", "group", "family"],
      },
    },
    required: ["metadata", "resources"],
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.6-terra",
      input: [{ role: "system", content: [{ type: "input_text", text: prompt }] }, { role: "user", content: [{ type: "input_text", text: transcript }] }],
      text: { format: { type: "json_schema", name: "sunday_multiplied_package", strict: true, schema } },
    }),
  });
  const data = await response.json() as {
    output_text?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(data.error?.message || "Resource generation failed.");
  const outputText = data.output_text || extractOutputText(data.output);
  if (!outputText) throw new Error("Resource generation returned no output.");
  return JSON.parse(outputText) as GeneratedPackage;
}

function enforceResourceStyling(input: string, church: ChurchConfig, kind: "monday" | "group" | "family") {
  let html = input.trim();
  const stylesheetLinks = `<link rel="stylesheet" href="${church.baseCssUrl}">\n<link rel="stylesheet" href="${church.cssUrl}">`;
  html = html.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>\s*/gi, "");
  if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${stylesheetLinks}\n</head>`);
  html = html.replace(/<body\b([^>]*)>/i, (match, attrs: string) => {
    const classMatch = attrs.match(/class=["']([^"']*)["']/i);
    const classes = new Set((classMatch?.[1] || "").split(/\s+/).filter(Boolean));
    classes.add("sm-resource");
    classes.add(`sm-${kind}`);
    const nextClass = `class="${[...classes].join(" ")}"`;
    if (classMatch) return `<body${attrs.replace(classMatch[0], nextClass)}>`;
    return `<body${attrs} ${nextClass}>`;
  });
  return html;
}

function extractOutputText(output: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> | undefined) {
  if (!output) return "";
  return output.flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text || "")
    .join("");
}

function normalizeTranscript(input: string, filename: string) {
  let text = input.replace(/^\uFEFF/, "").replace(/\r/g, "");
  if (/\.vtt$/i.test(filename)) {
    text = text.split("\n")
      .filter((line) => line.trim() && !/^WEBVTT/i.test(line) && !/^NOTE\b/i.test(line) && !/^\d+$/.test(line.trim()) && !/-->/.test(line))
      .map((line) => line.replace(/<[^>]+>/g, "").trim())
      .filter(Boolean)
      .filter((line, index, lines) => index === 0 || line !== lines[index - 1])
      .join("\n");
  }
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

async function saveManifest(bucket: R2Bucket, manifest: ProductionManifest) {
  await bucket.put(`production/manifests/${manifest.id}.json`, JSON.stringify(manifest, null, 2), { httpMetadata: { contentType: "application/json" } });
}
async function loadManifest(bucket: R2Bucket, id: string) {
  const object = await bucket.get(`production/manifests/${id}.json`);
  if (!object) return null;
  try { return await object.json<ProductionManifest>(); } catch { return null; }
}
function forwardAdminHeaders(headers: Headers) {
  const next = new Headers({ "content-type": "application/json" });
  for (const name of ["cf-access-authenticated-user-email", "oai-authenticated-user-email", "cf-access-jwt-assertion", "authorization", "cookie"]) {
    const value = headers.get(name); if (value) next.set(name, value);
  }
  return next;
}
function adminAuthorizationError(request: Request, env: ProductionEnv) {
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
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function clean(value: string, max: number) { return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max); }
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}