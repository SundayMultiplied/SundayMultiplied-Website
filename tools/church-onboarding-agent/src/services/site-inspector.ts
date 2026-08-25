import type { BrandAnalysis, BrandCandidate, BrandProfile, ChurchLink, ResearchFinding } from "../types";

const PRIVATE_HOST = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;
const PAGE_LIMIT = 450_000;
const CSS_LIMIT = 220_000;
const PAGE_HINTS = ["about", "sermon", "message", "watch", "ministr", "group", "event", "give", "contact"];
const ICON_FONT = /(?:font\s*awesome|fontawesome|etmodules|dashicons|material\s+icons?|glyphicons?|icomoon|themify|flaticon|eleganticons|divi)/i;
const DISPLAY_FONT = /(?:oswald|bebas|anton|playfair|abril|cinzel|cormorant|archivo\s+black|roboto\s+slab|merriweather)/i;

export function validatePublicUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" || PRIVATE_HOST.test(url.hostname)) throw new Error("Only public HTTPS URLs are allowed.");
  return url;
}

async function readTextLimited(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > limit) throw new Error(`A research source exceeded the ${Math.round(limit / 1000)} KB limit.`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let output = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); break; }
      output += decoder.decode(value, { stream: true });
    }
    return output + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function fetchText(raw: string, limit: number): Promise<{ text: string; url: URL }> {
  const requested = validatePublicUrl(raw);
  const response = await fetch(requested, { headers: { "user-agent": "SundayMultipliedOnboarding/2.0" }, redirect: "follow" });
  if (!response.ok) throw new Error(`${requested.hostname} returned ${response.status}.`);
  const finalUrl = validatePublicUrl(response.url);
  return { text: await readTextLimited(response, limit), url: finalUrl };
}

function meta(html: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ].map((pattern) => html.match(pattern)?.[1]).find(Boolean);
}

function absolute(href: string, base: URL): string | undefined {
  try { const url = new URL(href, base); return url.protocol === "https:" ? url.toString() : undefined; } catch { return undefined; }
}

function stripMarkup(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function normalizeHex(raw: string): string | undefined {
  const value = raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(value)) return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{8}$/.test(value) && value.slice(7) !== "00") return value.slice(0, 7);
  return undefined;
}

function rgbToHex(raw: string): string | undefined {
  const match = raw.match(/rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*([\d.]+))?/i);
  if (!match || (match[4] !== undefined && Number(match[4]) === 0)) return undefined;
  const channels = [match[1], match[2], match[3]].map(Number);
  if (channels.some((channel) => channel > 255)) return undefined;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function relativeLuminance(hex: string): number {
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return Number(((values[0] + 0.05) / (values[1] + 0.05)).toFixed(2));
}

function saturation(hex: string): number {
  const values = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((part) => parseInt(part, 16) / 255);
  return Math.max(...values) - Math.min(...values);
}

function rank(values: Map<string, { count: number; sources: Set<string> }>, limit = 12): BrandCandidate[] {
  return [...values.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0])).slice(0, limit)
    .map(([value, detail]) => ({ value, occurrences: detail.count, sources: [...detail.sources].slice(0, 5) }));
}

function addCandidate(store: Map<string, { count: number; sources: Set<string> }>, value: string, source: string) {
  const current = store.get(value) || { count: 0, sources: new Set<string>() };
  current.count += 1; current.sources.add(source); store.set(value, current);
}

function firstFontName(value: string): string {
  return value.split(",")[0].trim().replace(/!important/gi, "").replace(/["']/g, "").trim();
}

function isUsableTextFont(value: string): boolean {
  const first = firstFontName(value);
  return Boolean(first) && !/^(inherit|initial|unset|var\()/i.test(first) && !ICON_FONT.test(first);
}

function fontStack(value: string | undefined, fallback: string): string {
  if (!value || !isUsableTextFont(value)) return fallback;
  const first = firstFontName(value);
  const family = /\s/.test(first) ? `"${first}"` : first;
  return /serif/i.test(first) ? `${family}, Georgia, serif` : `${family}, Arial, sans-serif`;
}

function buildAnalysis(pages: Array<{ url: URL; html: string }>, stylesheets: Array<{ url: string; css: string }>): BrandAnalysis {
  const colors = new Map<string, { count: number; sources: Set<string> }>();
  const fonts = new Map<string, { count: number; sources: Set<string> }>();
  const radii = new Map<string, { count: number; sources: Set<string> }>();
  const sources = [...pages.map((page) => ({ url: page.url.toString(), text: page.html })), ...stylesheets.map((sheet) => ({ url: sheet.url, text: sheet.css }))];
  for (const source of sources) {
    for (const match of source.text.matchAll(/#[0-9a-f]{3,8}\b/gi)) { const value = normalizeHex(match[0]); if (value) addCandidate(colors, value, source.url); }
    for (const match of source.text.matchAll(/rgba?\([^)]{5,60}\)/gi)) { const value = rgbToHex(match[0]); if (value) addCandidate(colors, value, source.url); }
    for (const match of source.text.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
      const value = match[1].trim().replace(/\s+/g, " ").slice(0, 120);
      if (isUsableTextFont(value)) addCandidate(fonts, value, source.url);
    }
    for (const match of source.text.matchAll(/border-radius\s*:\s*([^;}]+)/gi)) {
      const value = match[1].trim().split(/\s+/)[0].slice(0, 24);
      if (/^(\d*\.?\d+)(px|rem|em|%)$/.test(value)) addCandidate(radii, value, source.url);
    }
  }
  const colorCandidates = rank(colors); const fontCandidates = rank(fonts, 8); const radiusCandidates = rank(radii, 8);
  const colorful = colorCandidates.filter((item) => saturation(item.value) >= 0.12);
  const dark = colorCandidates.filter((item) => relativeLuminance(item.value) < 0.25);
  const light = colorCandidates.filter((item) => relativeLuminance(item.value) > 0.82);
  const primary = colorful.find((item) => relativeLuminance(item.value) < 0.72)?.value || dark[0]?.value || "#153f35";
  const secondary = colorful.find((item) => item.value !== primary)?.value || "#dfe9e1";
  const accent = colorful.find((item) => item.value !== primary && item.value !== secondary)?.value || secondary;
  const background = light[0]?.value || "#ffffff";
  const text = dark.find((item) => contrast(item.value, background) >= 4.5)?.value || "#1f2933";
  const rawRadius = radiusCandidates[0]?.value || "8px";
  const radiusNumber = Number.parseFloat(rawRadius);
  const radiusPixels = rawRadius.endsWith("rem") || rawRadius.endsWith("em") ? radiusNumber * 16 : rawRadius.endsWith("%") ? 24 : radiusNumber;
  const buttonStyle: BrandProfile["buttonStyle"] = radiusPixels >= 18 ? "rounded" : radiusPixels >= 5 ? "soft" : "square";
  const visualTone = `${relativeLuminance(primary) < 0.18 ? "grounded" : "bright"}, ${saturation(primary) > 0.35 ? "bold" : "restrained"}, ${buttonStyle === "rounded" ? "welcoming" : buttonStyle === "square" ? "structured" : "contemporary"}`;
  const headingCandidate = fontCandidates.find((item) => DISPLAY_FONT.test(firstFontName(item.value))) || fontCandidates[0];
  const bodyCandidate = fontCandidates.find((item) => item !== headingCandidate && !DISPLAY_FONT.test(firstFontName(item.value)))
    || fontCandidates.find((item) => item !== headingCandidate)
    || headingCandidate;
  const suggestedProfile: BrandProfile = {
    primaryColor: primary, secondaryColor: secondary, accentColor: accent, backgroundColor: background, textColor: text,
    headingFont: fontStack(headingCandidate?.value, "Georgia, serif"),
    bodyFont: fontStack(bodyCandidate?.value, "Arial, sans-serif"),
    cornerRadius: rawRadius, buttonStyle, visualTone,
    visualNotes: `Automated review suggests a ${visualTone} visual system. Confirm recommendations against current logo files and recent social graphics.`,
  };
  const contrastChecks = [
    { label: "Body text", foreground: text, background },
    { label: "Primary text", foreground: primary, background },
    { label: "Text on primary", foreground: "#ffffff", background: primary },
  ].map((item) => { const ratio = contrast(item.foreground, item.background); return { ...item, ratio, level: ratio >= 4.5 ? "pass" as const : "review" as const }; });
  const warnings = contrastChecks.filter((item) => item.level === "review").map((item) => `${item.label} contrast is ${item.ratio}:1 and needs review.`);
  if (!fontCandidates.length) warnings.push("No reliable font-family declarations were found; confirm fonts manually.");
  if (pages.length < 2) warnings.push("Only one public page could be inspected; confirm the visual profile against social media.");
  return { analyzedAt: new Date().toISOString(), pagesAnalyzed: pages.map((page) => page.url.toString()), stylesheetsAnalyzed: stylesheets.map((sheet) => sheet.url), colorCandidates, fontCandidates, radiusCandidates, suggestedProfile, contrastChecks, warnings };
}

function discoverLinks(html: string, base: URL): { sources: ChurchLink[]; pages: string[]; stylesheets: string[] } {
  const discovered = new Map<string, ChurchLink>(); const pages: string[] = []; const stylesheets: string[] = [];
  for (const match of html.matchAll(/<link\s[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    if (!/stylesheet/i.test(match[0])) continue;
    const href = absolute(match[1], base); if (href && new URL(href).hostname === base.hostname && !stylesheets.includes(href)) stylesheets.push(href);
  }
  for (const match of html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = absolute(match[1], base); if (!href) continue;
    const target = new URL(href); const text = stripMarkup(match[2]); const lower = `${href} ${text}`.toLowerCase();
    const kind = lower.includes("youtube") ? "youtube" : lower.includes("facebook") ? "facebook" : lower.includes("vimeo") ? "vimeo" : lower.includes("instagram") ? "instagram" : /(sermon|message|watch)/.test(lower) ? "sermon_archive" : /(podcast|spotify|apple\.com\/.*podcast)/.test(lower) ? "podcast" : undefined;
    if (kind && !discovered.has(kind)) discovered.set(kind, { kind, url: href, label: text || kind, verifiedAt: new Date().toISOString() });
    if (target.hostname === base.hostname && PAGE_HINTS.some((hint) => lower.includes(hint)) && !pages.includes(href)) pages.push(href);
  }
  return { sources: [...discovered.values()], pages, stylesheets };
}

export async function inspectChurchWebsite(rawUrl: string): Promise<{ findings: ResearchFinding[]; links: ChurchLink[]; brandAnalysis: BrandAnalysis }> {
  const homepage = await fetchText(rawUrl, PAGE_LIMIT); const discovered = discoverLinks(homepage.text, homepage.url);
  const pages: Array<{ url: URL; html: string }> = [{ url: homepage.url, html: homepage.text }]; const researchWarnings: string[] = [];
  for (const pageUrl of discovered.pages.slice(0, 4)) {
    try { const page = await fetchText(pageUrl, PAGE_LIMIT); if (!pages.some((item) => item.url.toString() === page.url.toString())) pages.push({ url: page.url, html: page.text }); }
    catch (error) { researchWarnings.push(error instanceof Error ? error.message : `Could not inspect ${pageUrl}.`); }
  }
  const stylesheetUrls = new Set(discovered.stylesheets);
  for (const page of pages.slice(1)) for (const stylesheet of discoverLinks(page.html, page.url).stylesheets) stylesheetUrls.add(stylesheet);
  const stylesheets: Array<{ url: string; css: string }> = [];
  for (const stylesheetUrl of [...stylesheetUrls].slice(0, 12)) {
    try { const sheet = await fetchText(stylesheetUrl, CSS_LIMIT); stylesheets.push({ url: sheet.url.toString(), css: sheet.text }); }
    catch (error) { researchWarnings.push(error instanceof Error ? error.message : `Could not inspect ${stylesheetUrl}.`); }
  }
  const title = homepage.text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim(); const siteName = meta(homepage.text, "og:site_name"); const logo = meta(homepage.text, "og:image");
  const findings: ResearchFinding[] = [];
  if (siteName || title) findings.push({ field: "church_name", value: siteName || title || "", sourceUrl: homepage.url.toString(), confidence: siteName ? "high" : "medium" });
  if (logo) findings.push({ field: "logo_candidate", value: absolute(logo, homepage.url) || logo, sourceUrl: homepage.url.toString(), confidence: "medium" });
  const brandAnalysis = buildAnalysis(pages, stylesheets); brandAnalysis.warnings.push(...researchWarnings.slice(0, 5));
  for (const color of brandAnalysis.colorCandidates.slice(0, 5)) findings.push({ field: "brand_color", value: color.value, sourceUrl: color.sources[0], confidence: color.occurrences >= 3 ? "high" : "medium" });
  for (const font of brandAnalysis.fontCandidates.slice(0, 3)) findings.push({ field: "brand_font", value: font.value, sourceUrl: font.sources[0], confidence: font.occurrences >= 2 ? "high" : "medium" });
  return { findings, links: discovered.sources, brandAnalysis };
}
