#!/usr/bin/env bash
# Keep the live API awake in the day and restart it when it stops answering (plan G3-06).
#
# Usage: API_URL=<https://...> [HOOK=<deploy hook URL>] [SERVICE=<srv-...>] keep-alive.sh
#
# Twice on 08/11 and 09/11/2026 the API kept its port closed after a deploy and only a new deploy
# brought it back. This script, run every 10 minutes, does that by itself:
#
#   1. GET /health. Down means two failed tries in a row, RETRY_WAIT seconds apart (one slow answer
#      or a cold start is not a hang).
#   2. Answering: if an `api-down` issue is open, close it with the time it came back. Done.
#   3. Down: if a CI/CD run is deploying right now, leave it alone (a deploy restarts the API). Else
#      call the deploy hook for the last commit that passed CI/CD, wait up to HEAL_DEADLINE seconds
#      for /health, and open an `api-down` issue saying what happened, so the team sees it.
#      While an `api-down` issue is open the hook is not called again: one restart per incident,
#      then people look (docs/OUTAGES.md).
#
# Needs GH_TOKEN with issues: write and actions: read. The hook URL is never printed.
set -euo pipefail

: "${API_URL:?API_URL is not set}"
RETRY_WAIT="${RETRY_WAIT:-60}"          # seconds between the two tries
CHECK_TIMEOUT="${CHECK_TIMEOUT:-90}"    # a cold start of the free instance takes about a minute
HEAL_DEADLINE="${HEAL_DEADLINE:-600}"   # Docker build + start on Render take several minutes
LABEL="api-down"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# POSIX "UTC-7" is UTC+7 (Vietnam), and needs no time zone files
vn_time() { TZ=UTC-7 date +"%H:%M %d/%m"; }
spent() { echo "$(($1 / 60)) min $(($1 % 60)) s"; }

answering() { curl -fsS --max-time "$CHECK_TIMEOUT" "$API_URL/health" >/dev/null 2>&1; }

open_incident() {
  gh issue list --label "$LABEL" --state open --limit 1 --json number --jq '.[0].number // empty'
}

if answering || { echo "first try failed, again in ${RETRY_WAIT}s"; sleep "$RETRY_WAIT"; answering; }; then
  echo "$API_URL/health is answering"
  incident=$(open_incident)
  if [ -n "$incident" ]; then
    gh issue close "$incident" --comment "The API is answering again ($(vn_time), keep-alive)."
    echo "::notice::API answering again, closed #$incident"
  fi
  exit 0
fi

echo "::error::$API_URL/health did not answer twice in a row ($(vn_time))"

if [ -n "$(open_incident)" ]; then
  echo "::warning::An $LABEL issue is already open: not restarting again, see the issue"
  exit 1
fi

deploying=$(gh run list --workflow ci-cd.yml --branch main --status in_progress --limit 1 \
  --json databaseId --jq '.[0].databaseId // empty')
if [ -n "$deploying" ]; then
  echo "::warning::CI/CD run $deploying is in progress and may be deploying: not restarting now"
  exit 1
fi

# The last commit that passed every check: never deploy a commit whose checks failed
good=$(gh run list --workflow ci-cd.yml --branch main --status success --limit 1 \
  --json headSha --jq '.[0].headSha // empty')

result="The hook was not called: RENDER_DEPLOY_HOOK_API is not set."
if [ -n "${HOOK:-}" ]; then
  if GITHUB_SHA="$good" "$here/render-deploy.sh" API; then
    restarted=$SECONDS
    result="Still not answering $(spent "$HEAL_DEADLINE") after the restart."
    while [ $((SECONDS - restarted)) -lt "$HEAL_DEADLINE" ]; do
      if answering; then
        result="Answering again $(spent $((SECONDS - restarted))) after the restart."
        break
      fi
      sleep 20
    done
  else
    result="Calling the deploy hook failed (see the run log)."
  fi
fi
echo "$result"

gh label create "$LABEL" --color B60205 --description "The live API stopped answering (keep-alive)" \
  --force >/dev/null
run_url="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"
gh issue create --label "$LABEL" --title "Live API stopped answering ($(vn_time))" --body "$(cat <<EOF
Keep-alive found \`$API_URL/health\` not answering twice in a row, ${RETRY_WAIT} s apart, and restarted
the API with the deploy hook (commit \`${good:0:7}\`, the last one that passed CI/CD).

**Result:** $result

The next keep-alive run closes this issue once the API answers. If it stays open, follow
docs/OUTAGES.md: the Render log (does it stop at "Waiting for application startup."?), and the
migration lock query in #260.

Run: $run_url
EOF
)"

# Restarted and answering: the run stays green, the issue keeps the record
[[ "$result" == Answering* ]]
