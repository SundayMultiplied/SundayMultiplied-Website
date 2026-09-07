#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

worker="${SITES_PROJECT_ROOT}/dist/server/index.js"
wrangler_config="${SITES_PROJECT_ROOT}/dist/server/wrangler.json"
migrations="${SITES_PROJECT_ROOT}/drizzle"

[[ -f "${worker}" ]] || {
  echo "Missing Sites Worker entry: dist/server/index.js" >&2
  exit 66
}
[[ -f "${wrangler_config}" ]] || {
  echo "Missing generated Cloudflare configuration: dist/server/wrangler.json" >&2
  exit 66
}
[[ -d "${migrations}" ]] || {
  echo "Missing D1 migrations: drizzle/" >&2
  exit 66
}

# Validate the generated Cloudflare config without importing the Worker bundle in
# plain Node. The vinext Worker can legitimately import Cloudflare runtime
# modules such as `cloudflare:workers`, which Node's default ESM loader cannot
# resolve. `vinext build` has already performed the bundle/compile validation.
node --input-type=module - "${wrangler_config}" <<'NODE'
import { readFile } from "node:fs/promises";

const [configPath] = process.argv.slice(2);
const manifest = JSON.parse(await readFile(configPath, "utf8"));
if (!manifest || typeof manifest !== "object") {
  throw new Error("dist/server/wrangler.json must contain a JSON object");
}
if (manifest.d1_databases?.[0]?.binding !== "DB") {
  throw new Error("Generated Cloudflare config is missing the DB binding");
}
if (!manifest.r2_buckets?.some((bucket) => bucket.binding === "BUCKET")) {
  throw new Error("Generated Cloudflare config is missing the BUCKET binding");
}
NODE

# The Worker entry must be non-empty. Runtime compatibility is validated by
# Cloudflare/Workerd at deployment rather than by importing it in Node.
[[ -s "${worker}" ]] || {
  echo "Sites Worker entry is empty: dist/server/index.js" >&2
  exit 66
}

echo "Validated Cloudflare artifact: Worker entry, bindings, and D1 migrations are present."
