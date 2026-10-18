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
    sole = [t for t in tasks if len(t["owners"]) == 1]  # shared tasks are not anyone's share
    members = [{
        "login": login, "name": name,
        "tasks_done": sum(t["state"] == "closed" for t in sole if t["owners"] == [login]),
        "tasks_total": sum(t["owners"] == [login] for t in sole),
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

    recent = sorted(merged, key=lambda p: p["mergedAt"], reverse=True)[:8]
    current = next((m["title"] for m in milestones if m["due"] >= today.isoformat()), None)
    live = raw["live_version"] or {}
    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "commit": COMMIT,
        "days_left": (ASSESSMENT - today).days,
        "tasks": {"total": len(tasks), "done": sum(t["state"] == "closed" for t in tasks),
                  "in_review": sum(t["status"] == "In Review" for t in tasks),
                  "shared": len(tasks) - len(sole)},
        "current_milestone": current,
        "milestones": milestones,
        "burnup": {"planned": planned, "actual": actual},
        "members": members,
        # str(): a deleted GitHub account has no login (None), which cannot be sorted with names
        "matrix": [[a, r, n] for (a, r), n in sorted(matrix.items(), key=lambda kv: str(kv[0]))],
        "merged_prs": len(merged),
        "merged_without_review": sorted(p["number"] for p in merged if not reviewers(p)),
        "recent_prs": [{"number": p["number"], "title": p["title"], "url": p["url"],
                        "author": login_of(p["author"]), "merged": p["mergedAt"][:10],
                        "reviewers": sorted(reviewers(p))} for p in recent],
        "sprints": sprints,
        "runs": [{"title": r["display_title"], "url": r["html_url"], "sha": r["head_sha"],
                  "when": r["created_at"][:16].replace("T", " "),
                  "conclusion": r["conclusion"], "jobs": r["job_results"]}
                 for r in raw["runs"][:6]],
        "live": {"commit": live.get("commit"), "main_sha": raw["main_sha"],
                 "db_ok": (raw["live_db"] or {}).get("db") == "ok"},
    }


# ---------------------------------------------------------------- render
SHORT = {"NeitLN": "Tiến", "anh7032": "Duy Anh", "Jayson135724": "Hoàng Minh"}
SLOT = {login: f"m{i}" for i, login in enumerate(TEAM, start=1)}
RESULT = {"success": ("ok", "passed"), "failure": ("bad", "failed"), "skipped": ("", "skipped"),
          "cancelled": ("bad", "cancelled"), None: ("", "running")}


def esc(s):
    return html.escape(str(s))


def link(href, text, label=None):
    aria = f' aria-label="{esc(label)}"' if label else ""
    return f'<a href="{esc(href)}"{aria}>{text}</a>'


def issues_q(query):
    return f"{GH}/issues?q=" + urllib.parse.quote_plus(query)


def prs_q(query):
    return f"{GH}/pulls?q=" + urllib.parse.quote_plus(query)


def short(login):
    return esc(SHORT.get(login, login))


def fmt_day(iso):
    if not iso:  # a milestone without a due date
        return "no date"
    return dt.date.fromisoformat(iso).strftime("%a %d %b").replace(" 0", " ")


def distribution(d):
    """The signature: one bar per kind of contribution, split by member, counts outside."""
    rows = [
        ("Tasks done", f"single-owner task issues · {d['tasks']['shared']} shared tasks not split",
         "tasks_done", lambda who: issues_q(f"is:issue is:closed assignee:{who} T- in:title")),
        ("Pull requests merged", "authored by the member",
         "prs_merged", lambda who: prs_q(f"is:pr is:merged author:{who}")),
        ("Pull requests reviewed", "written by someone else",
         "reviews", lambda who: prs_q(f"is:pr reviewed-by:{who} -author:{who}")),
        ("Commits on main", "excluding merge commits",
         "commits", lambda who: f"{GH}/commits/main?author={who}"),
    ]
    out = []
    for title, note, key, href in rows:
        values = [(m["login"], m[key]) for m in d["members"]]
        total = sum(v for _, v in values)
        spoken = ", ".join(f"{SHORT[w]} {v}" for w, v in values)
        if total:
            segs = "".join(
                f'<span class="seg {SLOT[w]}" style="--w:{v / total * 100:.2f}%">'
                f'{v if v / total >= 0.08 else ""}</span>' for w, v in values if v)
            label = esc(f"{title}: {spoken}")
            bar = f'<div class="bar" role="img" aria-label="{label}">{segs}</div>'
        else:
            bar = '<div class="bar empty">None yet</div>'
        counts = "".join(
            f'<li><i class="sw {SLOT[w]}" aria-hidden="true"></i>{short(w)} '
            f'{link(href(w), f"<b>{v}</b>", f"{SHORT[w]}: {v} — open the records")}</li>'
            for w, v in values)
        out.append(f'<div class="dist-row"><div class="dist-label">{esc(title)}'
                   f'<small>{esc(note)}</small></div>{bar}<ul class="counts">{counts}</ul></div>')
    return "".join(out)


def burnup_svg(d):
    w, h, left, right, top_pad, bottom = 720, 240, 36, 12, 12, 30
    span = (ASSESSMENT - START).days
    top = max([n for _, n in d["burnup"]["planned"]] + [d["tasks"]["total"], 1])

    def x(date):
        return left + (dt.date.fromisoformat(date) - START).days / span * (w - left - right)

    def y(n):
        return h - bottom - n / top * (h - bottom - top_pad)

    def path(points, steps):
        out, prev = [], None
        for date, n in points:
            if steps and prev is not None and n != prev:
                out.append(f"{x(date):.1f},{y(prev):.1f}")
            out.append(f"{x(date):.1f},{y(n):.1f}")
            prev = n
        return " ".join(out)

    grid = "".join(
        f'<line class="gridline" x1="{left}" x2="{w - right}" y1="{y(v):.1f}" y2="{y(v):.1f}"/>'
        f'<text class="axis" x="{left - 8}" y="{y(v) + 4:.1f}" text-anchor="end">{v}</text>'
        for v in sorted({0, top // 2, top}))
    marks = "".join(
        f'<text class="axis" x="{x(m["due"]):.1f}" y="{h - 8}" text-anchor="middle">'
        f'{esc(m["title"].split(" ")[0])}</text>' for m in d["milestones"] if m["due"])
    today = d["burnup"]["actual"][-1][0] if d["burnup"]["actual"] else None
    now = (f'<line class="today" x1="{x(today):.1f}" x2="{x(today):.1f}" y1="{top_pad}" '
           f'y2="{h - bottom}"/>') if today else ""
    dot = ""
    if d["burnup"]["actual"]:
        last_day, last_n = d["burnup"]["actual"][-1]
        dot = (f'<circle class="dot" cx="{x(last_day):.1f}" cy="{y(last_n):.1f}" r="5"/>'
               f'<text class="dot-label" x="{x(last_day) + 9:.1f}" y="{y(last_n) - 8:.1f}">'
               f'{last_n} done</text>')
    return (f'<svg class="chart" viewBox="0 0 {w} {h}" role="img" aria-label="Tasks done: '
            f'actual {d["tasks"]["done"]} of {d["tasks"]["total"]}; planned line steps up at '
            f'each milestone due date">{grid}{marks}{now}'
            f'<polyline class="planned" points="{path(d["burnup"]["planned"], True)}"/>'
            f'<polyline class="actual" points="{path(d["burnup"]["actual"], False)}"/>{dot}</svg>')


def render(d):
    t, live = d["tasks"], d["live"]
    pct = t["done"] * 100 // max(t["total"], 1)
    current = next((m for m in d["milestones"] if m["title"] == d["current_milestone"]), None)

    nav = " ".join([
        link(BOARD_URL, "Project board"), link(GH + "/milestones", "Milestones"),
        link(issues_q("label:weekly-report"), "Weekly reports"),
        link(GH + "/blob/main/docs/ROADMAP.md", "Plan"), link(GH, "Repository"),
    ])
    figure = (f'{link(issues_q("is:issue is:closed T- in:title"), t["done"])}'
              f'<span class="of">/{link(issues_q("is:issue T- in:title"), t["total"])}</span>')
    lede = (f'{d["days_left"]} days to the assessment on Thu 12 Nov.' if not current else
            f'Current sprint: {link(current["url"], esc(current["title"]))}, '
            f'{current["done"]} of {current["total"]} done, due {fmt_day(current["due"])}. '
            f'{t["in_review"]} task{"s" if t["in_review"] != 1 else ""} waiting for review.')
    unreviewed = d["merged_without_review"]
    callout = ("" if not unreviewed else
               f'<p class="callout">{len(unreviewed)} merged pull request'
               f'{"s have" if len(unreviewed) != 1 else " has"} no recorded review: '
               + ", ".join(link(f"{GH}/pull/{n}", f"#{n}") for n in unreviewed) + ".</p>")

    def check(ok, label, value):
        mark = '<span class="ok">●</span>' if ok else '<span class="bad">●</span>'
        return f"<li>{mark}<span>{label}</span><span class='mono'>{value}</span></li>"

    in_sync = bool(live["commit"]) and live["commit"] == live["main_sha"]
    last = d["runs"][0] if d["runs"] else None
    health = "".join([
        check(in_sync, f'Live API {link(API_URL + "/api/version", "commit")}',
              esc((live["commit"] or "no answer")[:7]) + (" = main" if in_sync else " ≠ main")),
        check(live["db_ok"], f'Database {link(API_URL + "/health/db", "check")}',
              "ok" if live["db_ok"] else "failing"),
        check(bool(last) and last["conclusion"] == "success",
              f'Last {link(last["url"], "pipeline") if last else "pipeline"} on main',
              RESULT.get(last["conclusion"], ("", "unknown"))[1] if last else "none"),
        f'<li><span></span><span class="when">Checked {esc(d["generated_at"])}; '
        f'refreshed after every merge and daily.</span><span></span></li>',
    ])
    legend = "".join(f'<li><i class="sw {SLOT[w]}" aria-hidden="true"></i>'
                     f'<span><strong>{esc(n)}</strong> <small>@{esc(w)}</small></span></li>'
                     for w, n in TEAM.items())

    counts = {(a, r): n for a, r, n in d["matrix"]}

    def cell(author, reviewer):
        if author == reviewer:
            return '<td class="num self" aria-label="same person">—</td>'
        n = counts.get((author, reviewer), 0)
        query = prs_q(f"is:pr author:{author} reviewed-by:{reviewer}")
        text = f'<span class="zero">{n}</span>' if n == 0 else str(n)
        label = f"{SHORT[reviewer]} reviewed {n} of {SHORT[author]}'s pull requests"
        return f'<td class="num">{link(query, text, label)}</td>'

    matrix_head = "".join(f'<th scope="col" class="num">{short(w)}</th>' for w in TEAM)
    matrix_rows = "".join(f'<tr><th scope="row">{short(au)}</th>'
                          f'{"".join(cell(au, rv) for rv in TEAM)}</tr>' for au in TEAM)

    pr_rows = "".join(
        f'<tr><td>{link(p["url"], "#" + str(p["number"]))} {esc(p["title"])}</td>'
        f'<td>{short(p["author"])}</td>'
        f'<td>{", ".join(map(short, p["reviewers"])) or "<span class=none>none</span>"}</td>'
        f'<td class="num">{esc(p["merged"][5:])}</td></tr>' for p in d["recent_prs"])

    def mstone(m):
        pct_m = m["done"] * 100 // max(m["total"], 1)
        is_current = m["title"] == d["current_milestone"]
        here = ' class="current" aria-current="step"' if is_current else ""
        closed = link(issues_q('is:issue is:closed milestone:"' + m["title"] + '"'), m["done"])
        return (f'<li{here}><div class="name">{link(m["url"], esc(m["title"]))}</div>'
                f'<div class="due">due {fmt_day(m["due"])}</div>'
                f'<div class="mini" aria-hidden="true"><span style="--w:{pct_m}%"></span></div>'
                f'<small>{closed} of {m["total"]} done</small></li>')

    milestones = "".join(map(mstone, d["milestones"]))
    actual = dict(map(tuple, d["burnup"]["actual"]))
    burnup_table = ('<tr><th scope="col">Day</th><th scope="col" class="num">Planned</th>'
                    '<th scope="col" class="num">Actual</th></tr>' + "".join(
                        f'<tr><td class="mono">{day}</td><td class="num">{plan}</td>'
                        f'<td class="num">{actual.get(day, "")}</td></tr>'
                        for day, plan in d["burnup"]["planned"]))

    status_css = {"Done": "done", "In Review": "review", "Open": "open"}

    def task(x):
        owners = ", ".join(SHORT.get(u, u) for u in x["assignees"]) or "unassigned"
        return (f'<li><span class="st {status_css[x["status"]]}">{esc(x["status"].lower())}</span>'
                f'<span>{link(x["url"], esc(x["title"]))} '
                f'<span class="who">{esc(x["priority"])} · {esc(owners)}</span></span></li>')

    def sprint(title, items):
        done = sum(x["status"] == "Done" for x in items)
        is_open = " open" if title == d["current_milestone"] else ""
        return (f'<details class="sprint"{is_open}><summary><span class="title">{esc(title)}</span>'
                f'<span class="mono muted">{done}/{len(items)} done</span></summary>'
                f'<ul class="tasks">{"".join(map(task, items))}</ul></details>')

    sprints = "".join(sprint(k, v) for k, v in d["sprints"].items())

    def run_row(r):
        css, word = RESULT.get(r["conclusion"], ("", str(r["conclusion"])))
        jobs = "".join(f'<span class="{RESULT.get(c, ("", ""))[0]}">{esc(j)} '
                       f'{RESULT.get(c, ("", str(c)))[1]}</span>' for j, c in r["jobs"].items())
        return (f'<tr><td class="mono">{link(r["url"], esc(r["when"][5:]))}</td>'
                f'<td>{esc(r["title"].replace("Merge pull request ", "").split(" from ")[0])} '
                f'<span class="mono muted">{esc(r["sha"][:7])}</span></td>'
                f'<td class="{css}">{word}</td><td><div class="jobs">{jobs}</div></td></tr>')

    commit_url = f"{GH}/commit/{d['commit']}"
    footer = (f'Generated {esc(d["generated_at"])} from commit '
              f'{link(commit_url, esc(d["commit"][:7]))} by '
              f'{link(GH + "/blob/main/.github/workflows/dashboard.yml", "dashboard.yml")}, '
              f'using the GitHub API. Live checks are one sample taken at that time. '
              f'Raw data: {link("data.json", "data.json")}.')

    return string.Template(TEMPLATE.read_text(encoding="utf-8")).substitute(
        nav=nav, eyebrow=f'Session 20 · Thu 12 Nov · {d["days_left"]} days left',
        figure=figure, pct=pct, lede=lede, done_label=f"tasks done · {pct}%",
        heading_label=f"{t['done']} of {t['total']} tasks done · {pct}%",
        callout=callout, health=health, legend=legend,
        dist=distribution(d), matrix_head=matrix_head, matrix_rows=matrix_rows, pr_rows=pr_rows,
        task_total=t["total"], milestones=milestones, burnup=burnup_svg(d),
        burnup_table=burnup_table, board_link=link(BOARD_URL, "project board"),
        sprints=sprints, run_rows="".join(map(run_row, d["runs"])), footer=footer)


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
