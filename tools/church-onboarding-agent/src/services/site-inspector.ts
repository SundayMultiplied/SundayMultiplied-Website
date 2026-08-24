import type { ChurchLink, ResearchFinding } from "../types";

const PRIVATE_HOST = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;

export function validatePublicUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" || PRIVATE_HOST.test(url.hostname)) {
    throw new Error("Only public HTTPS URLs are allowed.");
  }
  return url;
}

function meta(html: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  return patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean);
}

function absolute(href: string, base: URL): string | undefined {
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

export async function inspectChurchWebsite(rawUrl: string): Promise<{
  findings: ResearchFinding[];
  links: ChurchLink[];
}> {
  const url = validatePublicUrl(rawUrl);
  const response = await fetch(url, {
    headers: { "user-agent": "SundayMultipliedOnboarding/1.0" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Website returned ${response.status}.`);
  const finalUrl = validatePublicUrl(response.url);
  const html = (await response.text()).slice(0, 600_000);
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const siteName = meta(html, "og:site_name");
  const logo = meta(html, "og:image");
  const findings: ResearchFinding[] = [];
  if (siteName || title) {
    findings.push({
      field: "church_name",
      value: siteName || title || "",
      sourceUrl: finalUrl.toString(),
      confidence: siteName ? "high" : "medium",
    });
  }
  if (logo) {
    findings.push({
      field: "logo_candidate",
      value: absolute(logo, finalUrl) || logo,
      sourceUrl: finalUrl.toString(),
      confidence: "medium",
    });
  }

  const discovered = new Map<string, ChurchLink>();
  const hrefPattern = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(hrefPattern)) {
    const href = absolute(match[1], finalUrl);
    if (!href) continue;
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const lower = `${href} ${text}`.toLowerCase();
    const kind = lower.includes("youtube")
      ? "youtube"
      : lower.includes("facebook")
        ? "facebook"
        : lower.includes("vimeo")
          ? "vimeo"
          : lower.includes("instagram")
            ? "instagram"
            : /(sermon|message|watch)/.test(lower)
              ? "sermon_archive"
              : /(podcast|spotify|apple\.com\/.*podcast)/.test(lower)
                ? "podcast"
                : undefined;
    if (kind && !discovered.has(kind)) {
      discovered.set(kind, { kind, url: href, label: text || kind, verifiedAt: new Date().toISOString() });
    }
  }
  return { findings, links: [...discovered.values()] };
}

