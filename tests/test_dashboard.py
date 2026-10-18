"""The progress dashboard (.github/dashboard/build.py) renders from GitHub data without crashing,
including the odd but valid cases: a milestone without a due date, a deleted GitHub account."""

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("dashboard", ROOT / ".github/dashboard/build.py")
dashboard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dashboard)


def issue(number, title, state="open", milestone=None, assignees=("NeitLN",)):
    return {"number": number, "title": title, "state": state, "html_url": f"https://x/{number}",
            "closed_at": "2026-10-16T10:00:00Z" if state == "closed" else None,
            "milestone": milestone, "labels": [{"name": "P0"}],
            "assignees": [{"login": a} for a in assignees]}


def pr(number, author, reviewers=(), state="MERGED"):
    return {"number": number, "title": f"PR {number}", "url": f"https://x/pull/{number}",
            "state": state, "mergedAt": "2026-10-16T10:00:00Z" if state == "MERGED" else None,
            "author": {"login": author} if author else None,
            "reviews": {"nodes": [{"author": {"login": r} if r else None} for r in reviewers]},
            "closingIssuesReferences": {"nodes": []}}


def raw_data():
    dated = {"number": 1, "title": "W7 · Foundation", "due_on": "2026-10-22T16:59:00Z",
             "html_url": "https://x/m/1"}
    undated = {"number": 2, "title": "Backlog", "due_on": None, "html_url": "https://x/m/2"}
    return {
        "milestones": [dated, undated],
        "issues": [issue(1, "T-01 · Plan", "closed", dated),
                   issue(2, "T-02 · Later", "open", undated),
                   issue(3, "Not a task")],
        "prs": [pr(10, "NeitLN", ["Jayson135724"]), pr(11, None, ["anh7032"]),
                pr(12, "anh7032", [None, "NeitLN"])],
        "commits": [{"author": {"login": "NeitLN"}, "parents": [{}]},
                    {"author": None, "parents": [{}]}],
        "runs": [{"display_title": "Merge pull request #10 from x/y", "html_url": "https://x/r",
                  "head_sha": "a" * 40, "created_at": "2026-10-16T10:00:00Z",
                  "conclusion": "success", "job_results": {"backend": "success"}}],
        "main_sha": "a" * 40,
        "live_version": None,  # the live API did not answer
        "live_db": None,
    }


def test_dashboard_renders_odd_but_valid_data():
    data = dashboard.derive(raw_data())
    page = dashboard.render(data)
    assert "no date" in page            # the undated milestone
    assert data["tasks"] == {"total": 2, "done": 1, "in_review": 0, "shared": 0}
    assert "$" not in page.split("<style>")[0]  # every template placeholder was filled


def test_member_counts_ignore_missing_accounts():
    data = dashboard.derive(raw_data())
    counts = {m["login"]: m for m in data["members"]}
    assert counts["NeitLN"]["reviews"] == 1      # reviewed #12
    assert counts["Jayson135724"]["reviews"] == 1
    assert counts["NeitLN"]["commits"] == 1      # the commit without an account is not anyone's
