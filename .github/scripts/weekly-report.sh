#!/usr/bin/env bash
# Build the weekly progress report and open it as an issue labelled weekly-report.
#
# Usage: weekly-report.sh            (needs GH_TOKEN, GITHUB_REPOSITORY and a full git history)
#        DRY_RUN=1 weekly-report.sh  (print the report instead of opening the issue)
set -euo pipefail

repo="${GITHUB_REPOSITORY:-NeitLN/Fair-Share}"
api_url="${API_URL:-https://fair-share-4bu9.onrender.com}"
until_day=$(date -u +%F)
since_day=$(date -u -d "$until_day - 7 days" +%F)
declare -A NAME=([NeitLN]="Võ Việt Tiến" [anh7032]="Duy Anh" [Jayson135724]="Hoàng Minh")

count() { gh api -X GET search/issues -f q="repo:$repo $1" --jq .total_count; }
bar() { local i out=""; for i in $(seq 1 10); do [ "$i" -le "$(( $1 / 10 ))" ] && out+="█" || out+="░"; done; echo "$out"; }

{
  echo "Automatic report for **$since_day → $until_day** (UTC)."
  echo "Board: https://github.com/users/NeitLN/projects/2 · Plan: [docs/ROADMAP.md](../blob/main/docs/ROADMAP.md)"
  echo

  echo "## Milestones"
  echo "| Milestone | Due | Done | Progress |"
  echo "|---|---|---|---|"
  gh api "repos/$repo/milestones?state=all&sort=due_on&direction=asc" \
    --jq '.[] | [.number, .title, (.due_on // "" | .[0:10])] | @tsv' |
    while IFS=$'\t' read -r number title due; do
      total=$(count "is:issue milestone:\"$title\"")
      closed=$(count "is:issue is:closed milestone:\"$title\"")
      pct=$(( total > 0 ? closed * 100 / total : 0 ))
      echo "| [$title](../milestone/$number) | $due | $closed / $total | \`$(bar "$pct")\` $pct% |"
    done
  echo

  echo "## Per member this week"
  echo "| Member | Issues closed | PRs merged | Reviews given | Commits on main |"
  echo "|---|---|---|---|---|"
  for login in NeitLN anh7032 Jayson135724; do
    issues=$(count "is:issue is:closed assignee:$login closed:>=$since_day")
    prs=$(count "is:pr is:merged author:$login merged:>=$since_day")
    reviews=$(count "is:pr reviewed-by:$login -author:$login updated:>=$since_day")
    commits=$(git log origin/main --no-merges --since="$since_day" --format='%ae %an' |
      grep -ciE "$login|${NAME[$login]}" || true)
    echo "| ${NAME[$login]} (@$login) | $issues | $prs | $reviews | $commits |"
  done
  echo
  echo "<sub>Commits are matched by GitHub username or display name; the contribution table in the report uses \`git shortlog -sn --no-merges\`.</sub>"
  echo

  echo "## Closed this week"
  gh issue list -R "$repo" --state closed --search "closed:>=$since_day" -L 100 \
    --json number,title,assignees \
    --jq '.[] | "- #\(.number) \(.title) — \([.assignees[].login] | map("@" + .) | join(", "))"' || true
  echo

  echo "## Merged pull requests"
  gh pr list -R "$repo" --state merged --search "merged:>=$since_day" -L 100 \
    --json number,title,author,reviews \
    --jq '.[] | "- #\(.number) \(.title) — by @\(.author.login), reviewed by \([.reviews[].author.login] | unique | map("@" + .) | join(", ") | if . == "" then "—" else . end)"' || true
  echo

  echo "## Next up (open P0 tasks in the current or earlier sprints)"
  gh issue list -R "$repo" --state open --label P0 -L 100 --json number,title,assignees,milestone \
    --jq "[.[] | select((.milestone.dueOn // \"9999\")[0:10] <= \"$(date -u -d "$until_day + 7 days" +%F)\")] | sort_by(.milestone.dueOn) | .[] | \"- [ ] #\(.number) \(.title) — \([.assignees[].login] | map(\"@\" + .) | join(\", \"))\"" || true
  echo

  echo "## Platform health"
  ci=$(gh run list -R "$repo" -b main -w ci-cd.yml -L 1 --json conclusion,displayTitle,url \
    --jq '.[0] | "\(.conclusion) — [\(.displayTitle)](\(.url))"' 2>/dev/null || echo "unknown")
  live=$(curl -fsS --max-time 90 "$api_url/api/version" 2>/dev/null | jq -r .commit 2>/dev/null) || live=""
  main_sha=$(git rev-parse origin/main)
  echo "- Last pipeline on \`main\`: $ci"
  if [ -z "$live" ]; then
    echo "- Live API commit: ❌ not answering"
  else
    echo "- Live API commit: \`${live:0:7}\` · \`main\`: \`${main_sha:0:7}\` $([ "$live" = "$main_sha" ] && echo "✅ in sync" || echo "⚠️ differs")"
  fi
  db=$(curl -fsS --max-time 90 "$api_url/health/db" >/dev/null 2>&1 && echo "✅ ok" || echo "❌ failing")
  echo "- Live database check (\`/health/db\`): $db"
} > report.md

title="Weekly report · $since_day → $until_day"
if [ -n "${DRY_RUN:-}" ]; then
  echo "# $title"; cat report.md
else
  gh label create weekly-report -R "$repo" --color 0e8a16 \
    --description "Automatic weekly progress report" 2>/dev/null || true
  gh issue create -R "$repo" --title "$title" --label weekly-report --body-file report.md
fi
