/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleApprovalApi } from "./approval-api";
import { handleApprovalListApi } from "./approval-list-api";
import { handleChurchAssetApi } from "./church-asset-api";
import { handleProductionApi } from "./production-api";
import { handleProductionJobAdminApi } from "./production-job-admin-api";
import { handleRevisionApi } from "./revision-api";

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
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
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

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/resource-assets/sample-church/logo" && request.method === "GET") {
      return Response.redirect(new URL("/sample-church-logo.webp", request.url).toString(), 302);
    }

    const churchAssetResponse = await handleChurchAssetApi(request, env);
    if (churchAssetResponse) return churchAssetResponse;

    const productionJobAdminResponse = await handleProductionJobAdminApi(request, env);
    if (productionJobAdminResponse) return productionJobAdminResponse;

    // Keep the production-to-approval handoff inside this Worker. A same-origin
    // fetch can be routed through the app shell / Access layer and return HTML,
    // which breaks the dashboard's JSON contract.
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

    const approvalListResponse = await handleApprovalListApi(request, env);
    if (approvalListResponse) return approvalListResponse;

    // Structured resource-level revision plumbing gets first chance at the
    // package GET and decision endpoints. Legacy review routes still fall
    // through to approval-api.ts for view tracking, resource previews, and
    // backward-compatible submissions.
    const revisionResponse = await handleRevisionApi(request, env, ctx);
    if (revisionResponse) return revisionResponse;

    const approvalResponse = await handleApprovalApi(request, env, ctx);
    if (approvalResponse) return approvalResponse;

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