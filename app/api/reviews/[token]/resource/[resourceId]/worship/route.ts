import { env } from "cloudflare:workers";
import { handleFamilyWorshipOverrideApi } from "../../../../../../../worker/family-worship-override-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  const response = await handleFamilyWorshipOverrideApi(request, env);
  return response || Response.json({ error: "Worship-song route not found." }, { status: 404 });
}
