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

export default worker;
