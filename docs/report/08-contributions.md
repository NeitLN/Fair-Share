# 8. Individual contributions

*Draft for report section 8 (compiled by Việt Tiến, signed by all). Figures as of 27/10/2026; they are
recomputed with the commands below just before the PDF (T-36), and every member checks their own row
before signing.*

## 8.1 Who did what

| Member | Role | Main work (task, pull requests) | Report sections |
|---|---|---|---|
| **Võ Việt Tiến** ([@NeitLN](https://github.com/NeitLN)) | Team leader, platform/DevOps, AI integration | Spec, architecture and roadmap (T-01); API Dockerfile (T-04); Supabase via `DATABASE_URL` (T-05); CI pipeline and branch protection (T-13); Render static site and deploy job (T-14, T-23); post-deploy smoke and keep-alive (T-24, T-26); secret audit with gitleaks (T-29); Gemini client and Quick add endpoint (T-21, T-22); design system, UI foundation and screens (T-41–T-44); database outage fix (#127); private households with invite links (#132: #137, #138); demo-day runbook (T-38, in review) | 1, 4, 6, 7, 8 (editor) |
| **Võ Hoàng Minh** ([@Jayson135724](https://github.com/Jayson135724)) | Backend and database lead | Backend structure, pool and error format (T-06); schema, migrations and seed (T-07); households, members, expenses, settlements and balances APIs with their tests (T-08, T-15–T-17); validation and error contract (T-25); persistence drill (T-27); architecture and ER diagrams (T-28); final README (T-39); red-gate demo branch (T-35) | 2, 5 |
| **Bùi Duy Anh** ([@anh7032](https://github.com/anh7032)) | Frontend lead, QA | React scaffold and typed API client (T-09); web image and nginx (T-10); Compose stack (T-11); households, members, expenses and dashboard pages (T-12, T-18, T-20); Quick add UI and its failure states (T-19); UI polish and Playwright smoke test (T-32, T-33); filters and CSV export (T-45, T-46); clean-clone rehearsal (T-34); slides (T-37) | 3, 6 (screenshots) |

Every member reviews the others' pull requests, and the peer review (T-30, #49) gives each member another
member's area: Duy Anh → Hoàng Minh, Việt Tiến → Duy Anh, Hoàng Minh → Việt Tiến.

## 8.2 What the repository shows

| | Việt Tiến | Hoàng Minh | Duy Anh |
|---|---|---|---|
| Commits on `main` (no merges) | 71 | 23 | 108 |
| Merged pull requests authored | 36 | 18 | 26 |
| Others' merged pull requests reviewed (approved) | 6 (6) | 50 (50) | 22 (19) |
| Closed issues assigned | 18 | 10 | 13 |
| Peer-review findings filed (T-30) | 2 | 0 (review of Việt Tiến's area due 29/10) | 4 |

All 69 pull requests merged by 27/10 from #14 on have an approval from someone other than their author
(section 4.3). Commit counts depend on how finely each person commits, so they are read together with
the pull requests and the tasks above, not on their own.

How the figures were taken:

```bash
git shortlog -sne --no-merges origin/main                     # commits (two e-mail names for Duy Anh, added up)
gh pr list --state merged --limit 300 --json number,author,reviews   # PRs authored, reviews by others
gh issue list --state closed --limit 300 --json number,assignees    # closed issues per assignee
```

## 8.3 Signatures

We agree that the table above describes our contributions.

| Member | Student ID | Signature | Date |
|---|---|---|---|
| Võ Việt Tiến | 2474802010391 | | |
| Võ Hoàng Minh | 2474802010242 | | |
| Bùi Duy Anh | 2474802010525 | | |
