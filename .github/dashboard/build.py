"""Build the Fair-Share progress dashboard (static HTML + data.json) from GitHub data.

Run by .github/workflows/dashboard.yml. Standard library only.

    GH_TOKEN=... GITHUB_REPOSITORY=NeitLN/Fair-Share python .github/dashboard/build.py _site

Every number on the page links to the GitHub query or record it was computed from.
"""
import datetime as dt
import html
import json
import os
import string
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

REPO = os.environ.get("GITHUB_REPOSITORY", "NeitLN/Fair-Share")
TOKEN = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN", "")
API_URL = os.environ.get("API_URL", "https://fair-share-4bu9.onrender.com")
COMMIT = os.environ.get("GITHUB_SHA", "local")
BOARD_URL = "https://github.com/users/NeitLN/projects/2"
GH = f"https://github.com/{REPO}"
START, ASSESSMENT = dt.date(2026, 10, 15), dt.date(2026, 11, 12)
TEAM = {"NeitLN": "Võ Việt Tiến", "anh7032": "Duy Anh", "Jayson135724": "Hoàng Minh"}
TEMPLATE = Path(__file__).with_name("template.html")


# ---------------------------------------------------------------- GitHub access
def _request(url, body=None):
    req = urllib.request.Request(url, data=body, headers={
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "fair-share-dashboard",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r), r.headers


def rest(path, params=None):
    """GET a REST resource; follow every page of a list."""
    query = urllib.parse.urlencode({"per_page": 100, **(params or {})})
    url, out = f"https://api.github.com/{path}?{query}", []
    while url:
        data, headers = _request(url)
        if isinstance(data, dict):  # a single object, or e.g. {"workflow_runs": [...]}
            return data
        out += data
        links = headers.get("Link", "").split(",")
        url = next((p.split(";")[0].strip("<> ") for p in links if 'rel="next"' in p), None)
    return out


def graphql(query, **variables):
    body = json.dumps({"query": query, "variables": variables}).encode()
    data, _ = _request("https://api.github.com/graphql", body)
    if data.get("errors"):
        raise RuntimeError(data["errors"])
    return data["data"]


def sample(path):
    """One request to the live API; None when it does not answer."""
    try:
        with urllib.request.urlopen(API_URL + path, timeout=90) as r:
            return json.load(r)
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None


PRS_QUERY = """query($o:String!,$n:String!,$c:String){repository(owner:$o,name:$n){
  pullRequests(first:100,after:$c,orderBy:{field:CREATED_AT,direction:ASC}){
    pageInfo{hasNextPage endCursor}
    nodes{number title url state mergedAt author{login}
      reviews(first:50){nodes{author{login}}}
      closingIssuesReferences(first:10){nodes{number}}}}}}"""


# ---------------------------------------------------------------- collect
def collect():
    owner, name = REPO.split("/")
    issues = rest(f"repos/{REPO}/issues", {"state": "all"})
    prs, cursor = [], None
    while True:
        conn = graphql(PRS_QUERY, o=owner, n=name, c=cursor)["repository"]["pullRequests"]
        prs += conn["nodes"]
        if not conn["pageInfo"]["hasNextPage"]:
            break
        cursor = conn["pageInfo"]["endCursor"]
    runs = rest(f"repos/{REPO}/actions/workflows/ci-cd.yml/runs",
                {"branch": "main", "event": "push", "per_page": 12})["workflow_runs"]
    for run in runs:
        jobs = rest(f"repos/{REPO}/actions/runs/{run['id']}/jobs")["jobs"]
        run["job_results"] = {j["name"]: j["conclusion"] for j in jobs}
    return {
        "milestones": rest(f"repos/{REPO}/milestones", {"state": "all", "sort": "due_on"}),
        "issues": [i for i in issues if "pull_request" not in i],
        "prs": prs,
        "commits": [c for c in rest(f"repos/{REPO}/commits", {"sha": "main"})
                    if len(c["parents"]) < 2],
        "runs": runs,
        "main_sha": rest(f"repos/{REPO}/commits/main")["sha"],
        "live_version": sample("/api/version"),
        "live_db": sample("/health/db"),
    }


# ---------------------------------------------------------------- derive
def login_of(node):
    return (node or {}).get("login")


def reviewers(pr):
    """Logins of everyone except the author who reviewed the pull request."""
    return {login_of(r["author"]) for r in pr["reviews"]["nodes"]} - {None, login_of(pr["author"])}


def derive(raw):
    today = dt.datetime.now(dt.timezone.utc).date()
    tasks = sorted((i for i in raw["issues"] if i["title"].startswith("T-")),
                   key=lambda t: t["title"])
    in_review = {n["number"] for p in raw["prs"] if p["state"] == "OPEN"
                 for n in p["closingIssuesReferences"]["nodes"]}
    for t in tasks:
        t["status"] = ("Done" if t["state"] == "closed"
                       else "In Review" if t["number"] in in_review else "Open")
        t["owners"] = [a["login"] for a in t["assignees"]]

    milestones = []
    for m in raw["milestones"]:
        mine = [t for t in tasks if (t.get("milestone") or {}).get("number") == m["number"]]
        milestones.append({"number": m["number"], "title": m["title"],
                           "due": (m["due_on"] or "")[:10], "url": m["html_url"],
                           "total": len(mine), "done": sum(t["state"] == "closed" for t in mine)})

    # Burn-up: planned = tasks of milestones due by that day; actual = tasks closed by that day.
    days = [START + dt.timedelta(n) for n in range((ASSESSMENT - START).days + 1)]
    closed = [dt.date.fromisoformat(t["closed_at"][:10]) for t in tasks if t["closed_at"]]
    due = [(dt.date.fromisoformat(m["due"]), m["total"]) for m in milestones if m["due"]]
    planned = [[d.isoformat(), sum(n for when, n in due if when <= d)] for d in days]
    actual = [[d.isoformat(), sum(c <= d for c in closed)] for d in days if d <= today]

    merged = [p for p in raw["prs"] if p["state"] == "MERGED"]
    members = [{
        "login": login, "name": name,
        "tasks_done": sum(t["state"] == "closed" for t in tasks if login in t["owners"]),
        "tasks_total": sum(login in t["owners"] for t in tasks),
        "prs_merged": sum(login_of(p["author"]) == login for p in merged),
        "reviews": sum(login in reviewers(p) for p in raw["prs"]),
        "commits": sum(login_of(c.get("author")) == login for c in raw["commits"]),
    } for login, name in TEAM.items()]

    matrix = Counter((login_of(p["author"]), r) for p in raw["prs"] for r in reviewers(p))
    sprints = defaultdict(list)
    for t in tasks:
        sprints[(t.get("milestone") or {}).get("title", "No milestone")].append({
            "number": t["number"], "title": t["title"], "url": t["html_url"],
            "status": t["status"], "assignees": t["owners"],
            "priority": next((lb["name"] for lb in t["labels"]
                              if lb["name"] in ("P0", "P1", "P2")), "")})

    recent = sorted(merged, key=lambda p: p["mergedAt"], reverse=True)[:12]
    live = raw["live_version"] or {}
    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "commit": COMMIT,
        "days_left": (ASSESSMENT - today).days,
        "tasks": {"total": len(tasks), "done": sum(t["state"] == "closed" for t in tasks),
                  "in_review": sum(t["status"] == "In Review" for t in tasks)},
        "milestones": milestones,
        "burnup": {"planned": planned, "actual": actual},
        "members": members,
        "matrix": [[a, r, n] for (a, r), n in sorted(matrix.items())],
        "merged_prs": len(merged),
        "merged_without_review": sum(not reviewers(p) for p in merged),
        "recent_prs": [{"number": p["number"], "title": p["title"], "url": p["url"],
                        "author": login_of(p["author"]), "merged": p["mergedAt"][:10],
                        "reviewers": sorted(reviewers(p))} for p in recent],
        "sprints": sprints,
        "runs": [{"title": r["display_title"], "url": r["html_url"], "sha": r["head_sha"],
                  "when": r["created_at"][:16].replace("T", " "),
                  "conclusion": r["conclusion"], "jobs": r["job_results"]} for r in raw["runs"]],
        "live": {"commit": live.get("commit"), "main_sha": raw["main_sha"],
                 "db_ok": (raw["live_db"] or {}).get("db") == "ok"},
    }


# ---------------------------------------------------------------- render
def esc(s):
    return html.escape(str(s))


def link(href, text):
    return f'<a href="{esc(href)}">{text}</a>'


def issues_q(query):
    return f"{GH}/issues?q=" + urllib.parse.quote_plus(query)


def prs_q(query):
    return f"{GH}/pulls?q=" + urllib.parse.quote_plus(query)


def name(login):
    return esc(TEAM.get(login, login))


ICON = {"success": "✅", "failure": "❌", "skipped": "⏭️", "cancelled": "⛔", None: "⏳"}


def burnup_svg(d):
    w, h, pad = 640, 220, 34
    span = (ASSESSMENT - START).days
    top = max([n for _, n in d["burnup"]["planned"]] + [d["tasks"]["total"], 1])

    def x(date):
        return pad + (dt.date.fromisoformat(date) - START).days / span * (w - 2 * pad)

    def y(n):
        return h - pad - n / top * (h - 2 * pad)

    def line(points):
        return " ".join(f"{x(t):.1f},{y(n):.1f}" for t, n in points)

    marks = "".join(
        f'<line x1="{x(m["due"]):.1f}" x2="{x(m["due"]):.1f}" y1="{pad}" y2="{h - pad}" '
        f'class="grid"/><text x="{x(m["due"]):.1f}" y="{h - 10}" class="axis" '
        f'text-anchor="middle">{esc(m["title"].split(" ")[0])}</text>'
        for m in d["milestones"] if m["due"])
    return (f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Planned versus actual tasks done">'
            f'<line x1="{pad}" y1="{h - pad}" x2="{w - pad}" y2="{h - pad}" class="grid"/>'
            f'<text x="{pad - 6}" y="{pad + 4}" class="axis" text-anchor="end">{top}</text>'
            f'<text x="{pad - 6}" y="{h - pad}" class="axis" text-anchor="end">0</text>{marks}'
            f'<polyline points="{line(d["burnup"]["planned"])}" class="planned"/>'
            f'<polyline points="{line(d["burnup"]["actual"])}" class="actual"/></svg>')


def tile(value, label, css=""):
    return f'<div class="tile"><b class="{css}">{value}</b><span>{label}</span></div>'


def render(d):
    t, live = d["tasks"], d["live"]
    state = ("in sync" if live["commit"] == live["main_sha"]
             else "down" if not live["commit"] else "behind")
    tiles = "".join([
        tile(d["days_left"], "days to Session 20"),
        tile(f'{link(issues_q("is:issue is:closed T- in:title"), t["done"])} / '
             f'{link(issues_q("is:issue T- in:title"), t["total"])}', "tasks done"),
        tile(t["in_review"], "tasks with an open PR"),
        tile(link(prs_q("is:pr is:merged"), d["merged_prs"]),
             f'PRs merged · {d["merged_without_review"]} without a review'),
        tile(state, f'live commit <code>{esc((live["commit"] or "n/a")[:7])}</code> vs main '
                    f'<code>{esc(live["main_sha"][:7])}</code>',
             "ok" if state == "in sync" else "warn"),
        tile("ok" if live["db_ok"] else "failing",
             f'live database ({link(API_URL + "/health/db", "/health/db")})',
             "ok" if live["db_ok"] else "bad"),
    ])

    def milestone_row(m):
        scope = 'milestone:"' + m["title"] + '"'
        pct = m["done"] * 100 // max(m["total"], 1)
        return (f'<tr><td>{link(m["url"], esc(m["title"]))}</td><td>{esc(m["due"])}</td>'
                f'<td><div class="bar"><span style="width:{pct}%"></span></div></td>'
                f'<td class="num">{link(issues_q("is:issue is:closed " + scope), m["done"])} / '
                f'{link(issues_q("is:issue " + scope), m["total"])}</td></tr>')

    milestone_rows = "".join(map(milestone_row, d["milestones"]))

    def member_row(m):
        who = m["login"]
        cells = [
            link(issues_q(f"is:issue is:closed assignee:{who}"), m["tasks_done"]) + " / "
            + link(issues_q(f"is:issue assignee:{who}"), m["tasks_total"]),
            link(prs_q(f"is:pr is:merged author:{who}"), m["prs_merged"]),
            link(prs_q(f"is:pr reviewed-by:{who} -author:{who}"), m["reviews"]),
            link(f"{GH}/commits/main?author={who}", m["commits"]),
        ]
        return (f"<tr><td><strong>{name(who)}</strong><br><small>@{esc(who)}</small></td>"
                + "".join(f'<td class="num">{c}</td>' for c in cells) + "</tr>")

    member_rows = "".join(map(member_row, d["members"]))

    counts = {(a, r): n for a, r, n in d["matrix"]}

    def cell(author, reviewer):
        if author == reviewer:
            return '<td class="num">—</td>'
        query = prs_q(f"is:pr author:{author} reviewed-by:{reviewer}")
        return f'<td class="num">{link(query, counts.get((author, reviewer), 0))}</td>'

    matrix_rows = "".join(
        f"<tr><th>{name(au)}</th>{''.join(cell(au, rv) for rv in TEAM)}</tr>" for au in TEAM)

    def task(x):
        owners = ", ".join(TEAM.get(u, u) for u in x["assignees"])
        return (f'<li class="{x["status"].replace(" ", "-").lower()}">'
                f'<span class="pill">{esc(x["status"])}</span>{link(x["url"], esc(x["title"]))} '
                f'<small>{esc(x["priority"])} · {esc(owners)}</small></li>')

    sprints = "".join(f"<h3>{esc(title)}</h3><ul class='tasks'>{''.join(map(task, items))}</ul>"
                      for title, items in d["sprints"].items())

    pr_rows = "".join(
        f'<tr><td>{link(p["url"], "#" + str(p["number"]))}</td><td>{esc(p["title"])}</td>'
        f'<td>{name(p["author"])}</td>'
        f'<td>{", ".join(map(name, p["reviewers"])) or "<span class=warn>none</span>"}</td>'
        f'<td>{esc(p["merged"])}</td></tr>' for p in d["recent_prs"])

    run_rows = "".join(
        f'<tr><td>{link(r["url"], esc(r["when"]))}</td><td>{esc(r["title"])}</td>'
        f'<td><code>{esc(r["sha"][:7])}</code></td>'
        f'<td>{ICON.get(r["conclusion"], esc(r["conclusion"]))}</td>'
        f'<td>{" ".join(f"{ICON.get(c, chr(183))}&nbsp;{esc(j)}" for j, c in r["jobs"].items())}'
        f'</td></tr>' for r in d["runs"])

    links = " · ".join([
        link(GH, "Repository"), link(BOARD_URL, "Project board"),
        link(GH + "/milestones", "Milestones"),
        link(issues_q("label:weekly-report"), "Weekly reports"),
        link(GH + "/blob/main/docs/ROADMAP.md", "Plan"), link(API_URL + "/docs", "Live API"),
    ])
    commit_url = f"{GH}/commit/{d['commit']}"
    footer = (f'Generated {esc(d["generated_at"])} from commit '
              f'{link(commit_url, esc(d["commit"][:7]))} by '
              f'{link(GH + "/blob/main/.github/workflows/dashboard.yml", "dashboard.yml")} '
              f'using the GitHub API; the live status is one sample taken at that time. '
              f'Raw data: {link("data.json", "data.json")}.')

    return string.Template(TEMPLATE.read_text(encoding="utf-8")).substitute(
        links=links, tiles=tiles, milestone_rows=milestone_rows, burnup=burnup_svg(d),
        task_total=t["total"], member_rows=member_rows, matrix_rows=matrix_rows,
        matrix_head="".join(f'<th class="num">{esc(n)}</th>' for n in TEAM.values()),
        board_link=link(BOARD_URL, "project board"), sprints=sprints, pr_rows=pr_rows,
        run_rows=run_rows, footer=footer)


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
    out.mkdir(parents=True, exist_ok=True)
    data = derive(collect())
    (out / "data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), "utf-8")
    (out / "index.html").write_text(render(data), "utf-8")
    done, total = data["tasks"]["done"], data["tasks"]["total"]
    print(f"dashboard written to {out}/: {done}/{total} tasks done")


if __name__ == "__main__":
    main()
