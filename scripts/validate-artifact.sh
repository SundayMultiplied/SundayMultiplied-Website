#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

worker="${SITES_PROJECT_ROOT}/dist/server/index.js"
hosting="${SITES_PROJECT_ROOT}/dist/.openai/hosting.json"
migrations="${SITES_PROJECT_ROOT}/dist/.openai/drizzle"

[[ -f "${worker}" ]] || {
  echo "Missing Sites Worker entry: dist/server/index.js" >&2
  exit 66
}
[[ -f "${hosting}" ]] || {
  echo "Missing packaged Sites manifest: dist/.openai/hosting.json" >&2
  exit 66
}
[[ -d "${migrations}" ]] || {
  echo "Missing packaged D1 migrations: dist/.openai/drizzle" >&2
  exit 66
}

# Validate the generated hosting manifest without importing the Worker bundle in
# plain Node. The vinext Worker can legitimately import Cloudflare runtime
# modules such as `cloudflare:workers`, which Node's default ESM loader cannot
# resolve. `vinext build` has already performed the bundle/compile validation.
node --input-type=module - "${hosting}" <<'NODE'
import { readFile } from "node:fs/promises";

const [hostingPath] = process.argv.slice(2);
const manifest = JSON.parse(await readFile(hostingPath, "utf8"));
if (!manifest || typeof manifest !== "object") {
  throw new Error("dist/.openai/hosting.json must contain a JSON object");
}
NODE

# The Worker entry must be non-empty. Runtime compatibility is validated by
# Cloudflare/Workerd at deployment rather than by importing it in Node.
[[ -s "${worker}" ]] || {
  echo "Sites Worker entry is empty: dist/server/index.js" >&2
  exit 66
}

echo "Validated Sites artifact: Worker entry, hosting manifest, and D1 migrations are present."
