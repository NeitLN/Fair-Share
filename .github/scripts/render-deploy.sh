#!/usr/bin/env bash
# Call a Render deploy hook and report which deploy it queued.
#
# Usage: HOOK=<deploy hook URL> [SERVICE=<srv-...>] render-deploy.sh <label>
# The hook URL is a secret and is never printed; Render's answer (a deploy id) is not secret.
# SERVICE is the Render service id the hook must belong to. A hook from another service is
# accepted by Render and deploys that other service, so the job would stay green while
# production never changes.
set -euo pipefail

label="${1:-service}"
: "${HOOK:?HOOK is not set}"

if [ -n "${SERVICE:-}" ] && [[ "$HOOK" != *"/deploy/$SERVICE?"* ]]; then
  echo "::error::The $label deploy hook does not belong to Render service $SERVICE. Copy the Deploy Hook from that service's Settings into the repository secret."
  exit 1
fi

answer=$(curl -fsS -X POST "$HOOK")
deploy_id=$(jq -r '.deploy.id // empty' <<<"$answer" 2>/dev/null || true)

if [ -n "$deploy_id" ]; then
  echo "::notice::Render queued $label deploy $deploy_id"
else
  # Render accepted the call but created no new deploy, e.g. one is already queued.
  echo "::warning::Render accepted the $label hook but returned no deploy id (answer: ${answer:-empty}). The smoke job will tell whether the new commit went live."
fi
