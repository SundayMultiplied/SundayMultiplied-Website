import { Agent, callable, routeAgentRequest } from "agents";
import { createOnboardingPullRequest, type BinaryRepositoryFile } from "./services/github";
import { buildRepositoryFiles, primaryLogoPublicPath } from "./services/repo-files";
import { syncOnboardingCrm, type CrmUpdate } from "./services/crm";
import { inspectChurchWebsite, validatePublicUrl } from "./services/site-inspector";
import { emptyState, type BrandProfile, type ChurchBasics, type ChurchLink, type OnboardingState, type Reviewer, type ResourceType } from "./types";

type AppEnv = Cloudflare.Env & {
  ASSETS: Fetcher;
  GITHUB_TOKEN: string;
  CRM_WEBHOOK_URL?: string;
  CRM_WEBHOOK_SECRET?: string;
};

const now = () => new Date().toISOString();
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

export class ChurchOnboardingAgent extends Agent<AppEnv, OnboardingState> {
  initialState = emptyState();

  private save(patch: Partial<OnboardingState>) {
    this.setState({ ...this.state, ...patch, updatedAt: now() });
  }

  private async syncCrm(update: CrmUpdate) {
    const result = await syncOnboardingCrm(this.env, this.state, update);
    if (result.status === "failed") console.error("Onboarding continued without CRM update", result.message);
    return result;
  }

  @callable()
  async resetOnboarding() {
    if (this.state.github) {
      throw new Error("Completed repository handoffs cannot be erased. Start a new church draft instead.");
    }
    await Promise.all(this.state.assets.map((asset) => this.env.CHURCH_ASSETS.delete(asset.r2Key)));
    const reset = emptyState();
    this.setState(reset);
    return reset;
  }

  @callable()
  async removeLogo(kind: "primary" | "reverse" | "mark" | "favicon") {
    const asset = this.state.assets.find((item) => item.kind === kind);
    if (!asset) return this.state;
    await this.env.CHURCH_ASSETS.delete(asset.r2Key);
    const assets = this.state.assets.filter((item) => item.kind !== kind);
    this.save({
      assets,
      checklist: { ...this.state.checklist, logos: assets.some((item) => item.kind === "primary") },
    });
    return this.state;
  }

  @callable()
  async saveBasics(basics: ChurchBasics) {
    if (!basics.name.trim() || !slugPattern.test(basics.slug)) throw new Error("A church name and URL-safe slug are required.");
    validatePublicUrl(basics.website);
    const startedAt = now();
    this.save({ basics, phase: "researching", checklist: { ...this.state.checklist, identity: true } });
    return this.syncCrm({
      stage: "Researching",
      startedAt,
      brandProfile: "Not Started",
      repositoryWorkspace: "Not Created",
    });
  }

  @callable()
  async researchWebsite() {
    const result = await inspectChurchWebsite(this.state.basics.website);
    const links = [...this.state.links];
    for (const candidate of result.links) {
      if (!links.some((link) => link.kind === candidate.kind && link.url === candidate.url)) links.push(candidate);
    }
    this.save({
      findings: result.findings,
      brandAnalysis: result.brandAnalysis,
      brand: result.brandAnalysis.suggestedProfile,
      links,
      phase: "needs_confirmation",
      checklist: { ...this.state.checklist, sources: links.length > 0, brandResearch: true },
    });
    await this.syncCrm({ stage: "Brand Review", brandProfile: "Draft" });
    return result;
  }

  @callable()
  saveLinks(links: ChurchLink[]) {
    for (const link of links) validatePublicUrl(link.url);
    this.save({ links, checklist: { ...this.state.checklist, sources: links.length > 0 } });
  }

  @callable()
  async saveBrand(brand: BrandProfile) {
    const color = /^#[0-9a-f]{6}$/i;
    for (const value of [brand.primaryColor, brand.secondaryColor, brand.accentColor, brand.backgroundColor, brand.textColor]) {
      if (!color.test(value)) throw new Error("Brand colors must use six-digit hex values.");
    }
    this.save({ brand, phase: "style_ready", checklist: { ...this.state.checklist, brand: true } });
    return this.syncCrm({ stage: "Approval Setup", brandProfile: "Approved" });
  }

  @callable()
  async saveApproval(reviewers: Reviewer[], resources: ResourceType[], deliveryDay: string) {
    if (!reviewers.length || reviewers.some((reviewer) => !reviewer.email.includes("@"))) {
      throw new Error("At least one valid reviewer is required.");
    }
    if (!resources.length) throw new Error("Select at least one resource.");
    this.save({
      reviewers,
      resources,
      deliveryDay,
      phase: "approval_ready",
      checklist: { ...this.state.checklist, reviewer: true },
    });
    return this.syncCrm({ stage: "Approval Setup" });
  }

  async onRequest(request: Request) {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    if (!this.state.basics.slug) return new Response("Save the church identity before uploading logos.", { status: 409 });
    const kind = request.headers.get("x-asset-kind");
    const filename = request.headers.get("x-file-name") || "logo";
    const contentType = request.headers.get("content-type") || "application/octet-stream";
    if (!kind || !["primary", "reverse", "mark", "favicon"].includes(kind)) {
      return new Response("Invalid logo kind.", { status: 400 });
    }
    if (![/^image\/png$/, /^image\/jpeg$/, /^image\/webp$/, /^image\/svg\+xml$/].some((rule) => rule.test(contentType))) {
      return new Response("Use an SVG, PNG, JPEG, or WebP image.", { status: 415 });
    }
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 5_000_000) return new Response("Logo must be smaller than 5 MB.", { status: 413 });
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
    const r2Key = `churches/${this.state.basics.slug}/brand/${kind}-${safeName}`;
    await this.env.CHURCH_ASSETS.put(r2Key, bytes, {
      httpMetadata: { contentType },
      customMetadata: { church: this.state.basics.slug, kind },
    });
    const asset = {
      kind: kind as "primary" | "reverse" | "mark" | "favicon",
      filename: safeName,
      r2Key,
      contentType,
      uploadedAt: now(),
    };
    const assets = [...this.state.assets.filter((item) => item.kind !== asset.kind), asset];
    this.save({
      assets,
      phase: assets.some((item) => item.kind === "primary") ? "assets_complete" : this.state.phase,
      checklist: { ...this.state.checklist, logos: assets.some((item) => item.kind === "primary") },
    });
    return Response.json(asset);
  }

  @callable()
  repositoryPreview() {
    return buildRepositoryFiles(this.state);
  }

  @callable()
  async createGitHubPullRequest() {
    if (!this.state.checklist.identity || !this.state.checklist.brand || !this.state.checklist.reviewer) {
      throw new Error("Confirm identity, brand, and reviewer settings first.");
    }
    if (!this.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not configured.");

    const files: Array<ReturnType<typeof buildRepositoryFiles>[number] | BinaryRepositoryFile> = buildRepositoryFiles(this.state);
    const primary = this.state.assets.find((asset) => asset.kind === "primary");
    const publicLogo = primaryLogoPublicPath(this.state);
    if (primary && publicLogo) {
      const stored = await this.env.CHURCH_ASSETS.get(primary.r2Key);
      if (!stored) throw new Error("The uploaded primary logo could not be read from church asset storage.");
      files.push({ path: `public${publicLogo}`, base64: arrayBufferToBase64(await stored.arrayBuffer()) });
    }

    const result = await createOnboardingPullRequest(
      {
        owner: this.env.GITHUB_OWNER,
        repo: this.env.GITHUB_REPO,
        baseBranch: this.env.GITHUB_BASE_BRANCH,
        token: this.env.GITHUB_TOKEN,
      },
      this.state.basics.slug,
      this.state.basics.name,
      files,
    );
    this.save({
      phase: "repo_ready",
      github: { ...result, createdAt: now() },
      checklist: { ...this.state.checklist, repository: true },
    });
    this.ctx.waitUntil(this.syncCrm({
      stage: "Repository PR",
      brandProfile: "Approved",
      repositoryWorkspace: "PR Open",
      onboardingDraftUrl: result.pullRequestUrl,
    }));
    return result;
  }
}

function isAuthorized(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  return Boolean(request.headers.get("cf-access-authenticated-user-email"));
}

export default {
  async fetch(request: Request, env: AppEnv) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/agents/") && !isAuthorized(request)) {
      return new Response("Cloudflare Access authentication required.", { status: 401 });
    }
    return (await routeAgentRequest(request, env)) ?? env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<AppEnv>;
