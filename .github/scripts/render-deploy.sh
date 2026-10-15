#!/usr/bin/env bash
# Call a Render deploy hook and report which deploy it queued.
#
# Usage: HOOK=<deploy hook URL> render-deploy.sh <label>
# The hook URL is a secret and is never printed; Render's answer (a deploy id) is not secret.
set -euo pipefail

label="${1:-service}"
: "${HOOK:?HOOK is not set}"

answer=$(curl -fsS -X POST "$HOOK")
deploy_id=$(jq -r '.deploy.id // empty' <<<"$answer" 2>/dev/null || true)

if [ -n "$deploy_id" ]; then
  echo "::notice::Render queued $label deploy $deploy_id"
else
  # Render accepted the call but created no new deploy, e.g. one is already queued.
  echo "::warning::Render accepted the $label hook but returned no deploy id (answer: ${answer:-empty}). The smoke job will tell whether the new commit went live."
fi
