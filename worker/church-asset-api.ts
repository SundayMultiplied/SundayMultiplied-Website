import { PRIMARY_LOGO_R2_KEYS } from "./generated/church-assets";

type ChurchAssetEnv = {
  BUCKET?: R2Bucket;
  CHURCH_ASSETS?: R2Bucket;
};

export async function handleChurchAssetApi(request: Request, env: ChurchAssetEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/resource-assets\/([a-z0-9]+(?:-[a-z0-9]+)*)\/logo$/);
  if (!match || request.method !== "GET") return null;
  if (!env.BUCKET && !env.CHURCH_ASSETS) return new Response("Logo storage is not configured.", { status: 503 });

  const slug = match[1];
  const originalKey = PRIMARY_LOGO_R2_KEYS[slug];
  const candidates: Array<{ bucket?: R2Bucket; key?: string }> = [
    { bucket: env.BUCKET, key: `resource-assets/${slug}/primary` },
    { bucket: env.BUCKET, key: originalKey },
    { bucket: env.CHURCH_ASSETS, key: originalKey },
  ];

  for (const candidate of candidates) {
    if (!candidate.bucket || !candidate.key) continue;
    const object = await candidate.bucket.get(candidate.key);
    if (!object) continue;
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    if (!headers.get("content-type")) headers.set("content-type", "application/octet-stream");
    headers.set("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  }

  return new Response("Logo not found.", { status: 404 });
}
