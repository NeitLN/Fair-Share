# 8. Individual contributions

*Compiled by Việt Tiến, checked and signed by all. Figures as of 27/10/2026, recomputed just before the
PDF (T-36).*

| Member | Main work (task, pull request) | Report sections |
|---|---|---|
| **Võ Việt Tiến** ([@NeitLN](https://github.com/NeitLN)), team leader, platform/DevOps, AI | Spec, architecture and roadmap (T-01); API Dockerfile (T-04); Supabase via `DATABASE_URL` (T-05); CI pipeline and branch protection (T-13); Render static site and deploy job (T-14, T-23); post-deploy smoke and keep-alive (T-24, T-26); secret audit with gitleaks (T-29); Gemini client and Quick add endpoint (T-21, T-22); design system, UI foundation and screens (T-41–T-44); database outage fix (#127); private households with invite links (#132: #137, #138); demo-day runbook (T-38, in review) | 1, 4, 6, 7, 8 (editor) |
| **Võ Hoàng Minh** ([@Jayson135724](https://github.com/Jayson135724)), backend and database lead | Backend structure, pool and error format (T-06); schema, migrations and seed (T-07); households, members, expenses, settlements and balances APIs with their tests (T-08, T-15–T-17); validation and error contract (T-25); persistence drill (T-27); architecture and ER diagrams (T-28); final README (T-39); red-gate demo branch (T-35) | 2, 5 |
| **Bùi Duy Anh** ([@anh7032](https://github.com/anh7032)), frontend lead, QA | React scaffold and typed API client (T-09); web image and nginx (T-10); Compose stack (T-11); households, members, expenses and dashboard pages (T-12, T-18, T-20); Quick add UI and its failure states (T-19); UI polish and Playwright smoke test (T-32, T-33); accessibility checklist as a browser test (#114); filters and CSV export (T-45, T-46); demo household data (#125); clean-clone rehearsal (T-34); slides (T-37); reviews that caught the commit-after-response bug (#84) and the invite-key bypass (#138) | 3, 6 (screenshots) |

Every member reviews the others' pull requests. In the peer review (T-30, #49) each member took another
member's area: Duy Anh → Hoàng Minh, Việt Tiến → Duy Anh, Hoàng Minh → Việt Tiến.

| What the repository shows | Việt Tiến | Hoàng Minh | Duy Anh |
|---|---|---|---|
| Commits on `main`, no merges (`git shortlog -sne --no-merges`; Duy Anh's two e-mails added up) | 71 | 23 | 108 |
| Merged pull requests authored (`gh pr list --state merged`) | 36 | 18 | 26 |
| Others' merged pull requests reviewed (approved) | 6 (6) | 50 (50) | 22 (21) |
| Closed issues assigned (`gh issue list --state closed`) | 18 | 10 | 13 |
| Peer-review findings filed (T-30) | 2 | 0 (due 29/10) | 4 |

Commit counts depend on how finely each person commits, so they are read together with the pull requests
and the tasks above, not on their own.

We agree that the tables above describe our contributions, and on the shares below (together 100%).

| Member | Student ID | Share of the work | Signature | Date |
|---|---|---|---|---|
| Võ Việt Tiến | 2474802010391 | % | | |
| Võ Hoàng Minh | 2474802010242 | % | | |
| Bùi Duy Anh | 2474802010525 | % | | |
