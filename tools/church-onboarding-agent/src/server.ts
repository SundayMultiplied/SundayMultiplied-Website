import { Agent, callable, routeAgentRequest } from "agents";
import { createOnboardingPullRequest, createThemeUpdatePullRequest, loadChurchTheme } from "./services/github";
import { buildRepositoryFiles } from "./services/repo-files";
import { syncOnboardingCrm, type CrmUpdate } from "./services/crm";
import { inspectChurchWebsite, validatePublicUrl } from "./services/site-inspector";
import { emptyState, normalizeBrandProfile, type BrandProfile, type ChurchBasics, type ChurchLink, type OnboardingState, type Reviewer, type ResourceType } from "./types";

type AppEnv = Cloudflare.Env & {
  ASSETS: Fetcher;
  GITHUB_TOKEN: string;
  CRM_WEBHOOK_URL?: string;
  CRM_WEBHOOK_SECRET?: string;
  RESOURCE_ASSETS: R2Bucket;
};

const now = () => new Date().toISOString();
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const publicAssetKey = (slug: string, kind: string) => `resource-assets/${slug}/${kind}`;

export class ChurchOnboardingAgent extends Agent<AppEnv, OnboardingState> {
  initialState = emptyState();

  private save(patch: Partial<OnboardingState>) { this.setState({ ...this.state, ...patch, updatedAt: now() }); }
  private githubConfig() {
    if (!this.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not configured.");
    return { owner: this.env.GITHUB_OWNER, repo: this.env.GITHUB_REPO, baseBranch: this.env.GITHUB_BASE_BRANCH, token: this.env.GITHUB_TOKEN };
  }
  private async syncCrm(update: CrmUpdate) {
    const result = await syncOnboardingCrm(this.env, this.state, update);
    if (result.status === "failed") console.error("Onboarding continued without CRM update", result.message);
    return result;
  }
  private async syncPublicBrandAssets() {
    const slug = this.state.basics.slug;
    if (!slug) return;
    await Promise.all(this.state.assets.map(async (asset) => {
      const original = await this.env.CHURCH_ASSETS.get(asset.r2Key);
      if (!original) return;
      await this.env.RESOURCE_ASSETS.put(publicAssetKey(slug, asset.kind), original.body, { httpMetadata: { contentType: asset.contentType }, customMetadata: { church: slug, kind: asset.kind, sourceKey: asset.r2Key } });
    }));
  }

  @callable() async resetOnboarding() {
    if (this.state.github) throw new Error("Completed repository handoffs cannot be erased. Start a new church draft instead.");
    await Promise.all(this.state.assets.flatMap((asset) => [this.env.CHURCH_ASSETS.delete(asset.r2Key), this.state.basics.slug ? this.env.RESOURCE_ASSETS.delete(publicAssetKey(this.state.basics.slug, asset.kind)) : Promise.resolve()]));
    const reset = emptyState(); this.setState(reset); return reset;
  }
  @callable() async removeLogo(kind: "primary" | "reverse" | "mark" | "favicon") {
    const asset = this.state.assets.find((item) => item.kind === kind); if (!asset) return this.state;
    await Promise.all([this.env.CHURCH_ASSETS.delete(asset.r2Key), this.state.basics.slug ? this.env.RESOURCE_ASSETS.delete(publicAssetKey(this.state.basics.slug, kind)) : Promise.resolve()]);
    const assets = this.state.assets.filter((item) => item.kind !== kind);
    this.save({ assets, checklist: { ...this.state.checklist, logos: assets.some((item) => item.kind === "primary") } }); return this.state;
  }
  @callable() async saveBasics(basics: ChurchBasics) {
    if (!basics.name.trim() || !slugPattern.test(basics.slug)) throw new Error("A church name and URL-safe slug are required.");
    validatePublicUrl(basics.website); const startedAt = now();
    this.save({ basics, phase: "researching", checklist: { ...this.state.checklist, identity: true } });
    return this.syncCrm({ stage: "Researching", startedAt, brandProfile: "Not Started", repositoryWorkspace: "Not Created" });
  }
  @callable() async researchWebsite() {
    const result = await inspectChurchWebsite(this.state.basics.website); const links = [...this.state.links];
    for (const candidate of result.links) if (!links.some((link) => link.kind === candidate.kind && link.url === candidate.url)) links.push(candidate);
    this.save({ findings: result.findings, brandAnalysis: result.brandAnalysis, brand: normalizeBrandProfile(result.brandAnalysis.suggestedProfile), links, phase: "needs_confirmation", checklist: { ...this.state.checklist, sources: links.length > 0, brandResearch: true } });
    await this.syncCrm({ stage: "Brand Review", brandProfile: "Draft" }); return result;
  }
  @callable() saveLinks(links: ChurchLink[]) { for (const link of links) validatePublicUrl(link.url); this.save({ links, checklist: { ...this.state.checklist, sources: links.length > 0 } }); }
  @callable() async saveBrand(brand: BrandProfile) {
    const resolved = normalizeBrandProfile(brand); const color = /^#[0-9a-f]{6}$/i;
    const colors = [resolved.primaryColor, resolved.secondaryColor, resolved.accentColor, resolved.backgroundColor, resolved.textColor, resolved.mutedColor, resolved.borderColor, resolved.sectionBackgroundColor, resolved.calloutBackgroundColor, resolved.headerBackgroundColor, resolved.headerTextColor, resolved.scriptureBackgroundColor, resolved.questionBackgroundColor, resolved.prayerBackgroundColor, resolved.prayerTextColor];
    if (colors.some((value) => !color.test(value))) throw new Error("Theme colors must use six-digit hex values.");
    this.save({ brand: resolved, phase: "style_ready", checklist: { ...this.state.checklist, brand: true } });
    return this.syncCrm({ stage: "Approval Setup", brandProfile: "Approved" });
  }
  @callable() async loadExistingTheme(slug: string) { return loadChurchTheme(this.githubConfig(), slug); }
  @callable() async createThemePullRequest(slug: string, brand: BrandProfile) {
    if (!slugPattern.test(slug)) throw new Error("Enter a valid church slug.");
    await this.validateThemeOnly(brand); return createThemeUpdatePullRequest(this.githubConfig(), slug, normalizeBrandProfile(brand));
  }
  private async validateThemeOnly(brand: BrandProfile) {
    const resolved = normalizeBrandProfile(brand); const color = /^#[0-9a-f]{6}$/i;
    const colors = [resolved.primaryColor, resolved.secondaryColor, resolved.accentColor, resolved.backgroundColor, resolved.textColor, resolved.mutedColor, resolved.borderColor, resolved.sectionBackgroundColor, resolved.calloutBackgroundColor, resolved.headerBackgroundColor, resolved.headerTextColor, resolved.scriptureBackgroundColor, resolved.questionBackgroundColor, resolved.prayerBackgroundColor, resolved.prayerTextColor];
    if (colors.some((value) => !color.test(value))) throw new Error("Theme colors must use six-digit hex values.");
  }
  @callable() async saveApproval(reviewers: Reviewer[], resources: ResourceType[], deliveryDay: string) {
    if (!reviewers.length || reviewers.some((reviewer) => !reviewer.email.includes("@"))) throw new Error("At least one valid reviewer is required.");
    if (!resources.length) throw new Error("Select at least one resource.");
    this.save({ reviewers, resources, deliveryDay, phase: "approval_ready", checklist: { ...this.state.checklist, reviewer: true } });
    return this.syncCrm({ stage: "Approval Setup" });
  }
  async onRequest(request: Request) {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    if (!this.state.basics.slug) return new Response("Save the church identity before uploading logos.", { status: 409 });
    const kind = request.headers.get("x-asset-kind"); const filename = request.headers.get("x-file-name") || "logo"; const contentType = request.headers.get("content-type") || "application/octet-stream";
    if (!kind || !["primary", "reverse", "mark", "favicon"].includes(kind)) return new Response("Invalid logo kind.", { status: 400 });
    if (![/^image\/png$/, /^image\/jpeg$/, /^image\/webp$/, /^image\/svg\+xml$/].some((rule) => rule.test(contentType))) return new Response("Use an SVG, PNG, JPEG, or WebP image.", { status: 415 });
    const bytes = await request.arrayBuffer(); if (!bytes.byteLength || bytes.byteLength > 5_000_000) return new Response("Logo must be smaller than 5 MB.", { status: 413 });
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120); const r2Key = `churches/${this.state.basics.slug}/brand/${kind}-${safeName}`;
    await Promise.all([
      this.env.CHURCH_ASSETS.put(r2Key, bytes, { httpMetadata: { contentType }, customMetadata: { church: this.state.basics.slug, kind } }),
      this.env.RESOURCE_ASSETS.put(publicAssetKey(this.state.basics.slug, kind), bytes, { httpMetadata: { contentType }, customMetadata: { church: this.state.basics.slug, kind, sourceKey: r2Key } }),
    ]);
    const asset = { kind: kind as "primary" | "reverse" | "mark" | "favicon", filename: safeName, r2Key, contentType, uploadedAt: now() };
    const assets = [...this.state.assets.filter((item) => item.kind !== asset.kind), asset];
    this.save({ assets, phase: assets.some((item) => item.kind === "primary") ? "assets_complete" : this.state.phase, checklist: { ...this.state.checklist, logos: assets.some((item) => item.kind === "primary") } });
    return Response.json(asset);
  }
  @callable() repositoryPreview() { return buildRepositoryFiles(this.state); }
  @callable() async createGitHubPullRequest() {
    if (!this.state.checklist.identity || !this.state.checklist.brand || !this.state.checklist.reviewer) throw new Error("Confirm identity, brand, and reviewer settings first.");
    await this.syncPublicBrandAssets();
    const result = await createOnboardingPullRequest(this.githubConfig(), this.state.basics.slug, this.state.basics.name, buildRepositoryFiles(this.state));
    this.save({ phase: "repo_ready", github: { ...result, createdAt: now() }, checklist: { ...this.state.checklist, repository: true } });
    this.ctx.waitUntil(this.syncCrm({ stage: "Repository PR", brandProfile: "Approved", repositoryWorkspace: "PR Open", onboardingDraftUrl: result.pullRequestUrl })); return result;
  }
}

function isAuthorized(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  return Boolean(request.headers.get("cf-access-authenticated-user-email"));
}

async function serveThemeAsset(request: Request, env: AppEnv, slug: string) {
  const object = await env.RESOURCE_ASSETS.get(publicAssetKey(slug, "primary"));
  if (!object) return new Response("Logo not found.", { status: 404 });
  const headers = new Headers(); object.writeHttpMetadata(headers);
  if (!headers.get("content-type")) headers.set("content-type", "application/octet-stream");
  headers.set("cache-control", "private, max-age=60"); headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

export default {
  async fetch(request: Request, env: AppEnv) {
    const url = new URL(request.url);
    const themeAsset = url.pathname.match(/^\/theme-assets\/([a-z0-9]+(?:-[a-z0-9]+)*)\/logo$/);
    if (themeAsset && request.method === "GET") {
      if (!isAuthorized(request)) return new Response("Cloudflare Access authentication required.", { status: 401 });
      return serveThemeAsset(request, env, themeAsset[1]);
    }
    if (url.pathname.startsWith("/agents/") && !isAuthorized(request)) return new Response("Cloudflare Access authentication required.", { status: 401 });
    return (await routeAgentRequest(request, env)) ?? env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<AppEnv>;
