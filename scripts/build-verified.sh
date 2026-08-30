#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

command -v timeout || {
  echo "build-verified.sh requires GNU timeout." >&2
  exit 69
}

node "${SITES_PROJECT_ROOT}/scripts/generate-production-registry.mjs"

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
  exit 69
fi

echo "Running bounded vinext build..."
timeout \
  --signal=TERM \
  --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
  "${SITES_BUILD_TIMEOUT:-3m}" \
  "${vinext}" build

if [[ -d "${SITES_PROJECT_ROOT}/drizzle" ]]; then
  mkdir -p "${SITES_PROJECT_ROOT}/dist/.openai/drizzle"
  cp -R "${SITES_PROJECT_ROOT}/drizzle/." "${SITES_PROJECT_ROOT}/dist/.openai/drizzle/"
fi

"${script_dir}/validate-artifact.sh"