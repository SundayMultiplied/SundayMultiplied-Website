/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleApprovalApi } from "./approval-api";
import { handleProductionApi } from "./production-api";

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

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Sample Church is a legacy test church with a known static logo already
    // deployed from public/. Serve the stable resource URL directly from the
    // static asset binding before production routing so existing generated
    // previews keep working without regeneration.
    if (url.pathname === "/api/resource-assets/sample-church/logo" && request.method === "GET") {
      const assetRequest = new Request(new URL("/sample-church-logo.webp", request.url), {
        method: "GET",
        headers: { accept: "image/*" },
      });
      return env.ASSETS.fetch(assetRequest);
    }

    const productionResponse = await handleProductionApi(request, env);
    if (productionResponse) return productionResponse;

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
