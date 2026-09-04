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

# The generated Worker imports Cloudflare runtime modules such as
# `cloudflare:workers`. Importing the artifact with plain Node will therefore
# fail even when the Worker is valid. Syntax-check the Worker without resolving
# runtime imports, then validate the packaged JSON manifest separately.
node --check "${worker}"

node --input-type=module - "${hosting}" <<'NODE'
import { readFile } from "node:fs/promises";

const [hostingPath] = process.argv.slice(2);
JSON.parse(await readFile(hostingPath, "utf8"));
NODE

echo "Validated Sites artifact: Worker syntax, hosting manifest, and packaged migrations are present."
