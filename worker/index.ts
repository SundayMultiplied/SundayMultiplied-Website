/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleApprovalApi } from "./approval-api";
import { handleApprovalListApi } from "./approval-list-api";
import { handleChurchAssetApi } from "./church-asset-api";
import { finalizeApprovedPackage } from "./package-finalization";
import { handlePackageFinalizationApi } from "./package-finalization-api";
import { handleProductionApi } from "./production-api";
import { handleProductionJobAdminApi } from "./production-job-admin-api";
import { handleRevisionApi } from "./revision-api";
import { handleRevisionCommitApi } from "./revision-commit-api";
import { handleRevisionRegenerationApi } from "./revision-regeneration-api";
import { handleSystemHealthApi } from "./system-health-api";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET: R2Bucket;
  BREVO_API_KEY?: string;
  APPROVAL_ADMIN_EMAIL?: string;
  APPROVAL_NOTIFICATION_EMAIL?: string;
  APPROVAL_REVIEWER_EMAIL?: string;
  APPROVAL_FAILURE_EMAIL?: string;
  PUBLIC_SITE_ORIGIN?: string;
  ONBOARDING_ORIGIN?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  CF_VERSION_METADATA?: { id?: string; tag?: string; timestamp?: string };
  DEPLOYMENT_VERSION?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

type ProductionManifest = {
  id: string;
  churchSlug: string;
  churchName: string;
  weekOf: string;
  status: "ready_for_internal_review" | "sent_for_approval";
  metadata: { sermonTitle: string; seriesTitle: string; scripture: string };
  resources: Array<{ kind: string; title: string; previewUrl: string }>;
  reviewUrl?: string;
};

const ADMIN_HOST = "admin.sundaymultiplied.com";
const DEFAULT_ONBOARDING_ORIGIN = "https://onboarding.sundaymultiplied.com";

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === ADMIN_HOST && url.pathname === "/" && request.method === "GET") {
      return Response.redirect(new URL("/admin", request.url).toString(), 302);
    }

    if (url.hostname === ADMIN_HOST && url.pathname === "/onboarding" && request.method === "GET") {
      const onboardingOrigin = env.ONBOARDING_ORIGIN?.trim() || DEFAULT_ONBOARDING_ORIGIN;
      return Response.redirect(onboardingOrigin, 302);
    }

    const systemHealthResponse = await handleSystemHealthApi(request, env);
    if (systemHealthResponse) return systemHealthResponse;

    if (url.pathname === "/api/resource-assets/sample-church/logo" && request.method === "GET") {
      return Response.redirect(new URL("/sample-church-logo.webp", request.url).toString(), 302);
    }

    const churchAssetResponse = await handleChurchAssetApi(request, env);
    if (churchAssetResponse) return churchAssetResponse;

    const productionJobAdminResponse = await handleProductionJobAdminApi(request, env);
    if (productionJobAdminResponse) return productionJobAdminResponse;

    const productionSendMatch = url.pathname.match(/^\/api\/production\/jobs\/([^/]+)\/send$/);
    if (productionSendMatch && request.method === "POST") {
      const manifestObject = await env.BUCKET.get(`production/manifests/${productionSendMatch[1]}.json`);
      if (!manifestObject) return json({ error: "Production job not found." }, 404);

      let manifest: ProductionManifest;
      try {
        manifest = await manifestObject.json<ProductionManifest>();
      } catch {
        return json({ error: "Production job manifest is invalid." }, 500);
      }

      if (manifest.status === "sent_for_approval" && manifest.reviewUrl) {
        return json({ ok: true, reviewUrl: manifest.reviewUrl });
      }

      const headers = new Headers({ "content-type": "application/json" });
      for (const name of ["cf-access-authenticated-user-email", "oai-authenticated-user-email", "cf-access-jwt-assertion", "authorization", "cookie"]) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }

      const approvalRequest = new Request(new URL("/api/approvals", request.url), {
        method: "POST",
        headers,
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

      const approvalResponse = await handleApprovalApi(approvalRequest, env, ctx);
      if (!approvalResponse) return json({ error: "Approval handler did not accept the generated package." }, 500);

      const contentType = approvalResponse.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await approvalResponse.text();
        console.error("production_approval_handoff_non_json", approvalResponse.status, text.slice(0, 300));
        return json({ error: `Approval handoff returned an unexpected ${approvalResponse.status} response.` }, 502);
      }

      const data = await approvalResponse.json() as { error?: string; reviewUrl?: string };
      if (!approvalResponse.ok) {
        return json({ error: data.error || "Unable to send this package for approval." }, approvalResponse.status);
      }

      manifest.status = "sent_for_approval";
      manifest.reviewUrl = data.reviewUrl;
      await env.BUCKET.put(`production/manifests/${manifest.id}.json`, JSON.stringify(manifest, null, 2), {
        httpMetadata: { contentType: "application/json" },
      });
      return json({ ok: true, reviewUrl: manifest.reviewUrl });
    }

    const productionResponse = await handleProductionApi(request, env);
    if (productionResponse) return productionResponse;

    const packageFinalizationResponse = await handlePackageFinalizationApi(request, env);
    if (packageFinalizationResponse) return packageFinalizationResponse;

    const approvalListResponse = await handleApprovalListApi(request, env);
    if (approvalListResponse) return approvalListResponse;

    const revisionCommitResponse = await handleRevisionCommitApi(request, env);
    if (revisionCommitResponse) return revisionCommitResponse;

    const revisionRegenerationResponse = await handleRevisionRegenerationApi(request, env);
    if (revisionRegenerationResponse) return revisionRegenerationResponse;

    const revisionResponse = await handleRevisionApi(request, env, ctx);
    if (revisionResponse) return finalizeDecisionIfApproved(request, env, revisionResponse);

    const approvalResponse = await handleApprovalApi(request, env, ctx);
    if (approvalResponse) return finalizeDecisionIfApproved(request, env, approvalResponse);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

async function finalizeDecisionIfApproved(request: Request, env: Env, response: Response) {
  const url = new URL(request.url);
  const reviewMatch = url.pathname.match(/^\/api\/reviews\/([^/]+)\/decision$/);
  if (!reviewMatch || request.method !== "POST" || !response.ok) return response;

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return response;

  try {
    const data = await response.clone().json() as { status?: string };
    if (data.status !== "approved") return response;

    const tokenHash = await sha256(decodeURIComponent(reviewMatch[1]));
    const pkg = await env.DB.prepare("SELECT id FROM review_packages WHERE token_hash = ? LIMIT 1")
      .bind(tokenHash).first<{ id: string }>();
    if (!pkg?.id) {
      console.error("package_finalization_lookup_failed", { tokenHash });
      return response;
    }

    const archive = await finalizeApprovedPackage(env, pkg.id);
    if (archive.status !== "archived") {
      console.error("package_finalization_failed", { packageId: pkg.id, archive });
    }
  } catch (error) {
    console.error("package_finalization_failed", error);
  }
  return response;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export default worker;