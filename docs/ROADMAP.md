# Fair-Share — Roadmap and Work Plan

Today: Week 6 done (Lab 4). **Assessment: Session 20, Thursday 12 November 2026.**
Every task below is a GitHub issue (title starts with its ID, e.g. `T-07`) with an owner, a reviewer, a
milestone and labels; progress is tracked on the **Fair-Share Roadmap** project board.
This file is the plan; the board is the truth.

## 1. Team and roles

| Member | GitHub | Role | Owns (accountable for) |
|---|---|---|---|
| **Võ Việt Tiến** | [@NeitLN](https://github.com/NeitLN) | **Team leader · Project manager · Platform/DevOps lead · AI integration** | Roadmap and board, CI/CD, Render, Supabase, secrets, Gemini client, report editor, demo driver |
| **Hoàng Minh** | [@Jayson135724](https://github.com/Jayson135724) | **Backend & database lead** | Schema and migrations, REST API, split/balance logic, backend tests, persistence drill, architecture diagram |
| **Duy Anh** | [@anh7032](https://github.com/anh7032) | **Frontend lead · QA** | React SPA, AI quick-add UI and its failure states, web image and Compose, clean-clone rehearsal, slides |

Everyone reviews someone else's pull requests every week. **No PR is merged without another member's
approval**; after approval the author merges (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

### RACI for the assessed platform pieces

R = does the work · A = accountable · C = consulted · I = informed

| Piece | Việt Tiến | Hoàng Minh | Duy Anh |
|---|---|---|---|
| Dockerfile (API) | A/R | C | I |
| Dockerfile (web) + nginx | C | I | A/R |
| Compose stack | C | R | A/R |
| CI/CD pipeline | A/R | C | C |
| Render (API + static site) | A/R | I | C |
| Supabase database | A | R | I |
| Schema, migrations, API | C | A/R | C |
| AI feature (server) | A/R | C | C |
| AI feature (UI + failure UX) | C | I | A/R |
| Secret audit | A/R | R | R |
| Report | A/R (editor) | R | R |
| Demo | A/R (driver) | R | R |

## 2. Timeline and milestones

**Accelerated plan (agreed 20/10).** Feature freeze moves from Sat 07/11 to **Sun 01/11**, so the last
ten days are for the report, rehearsals and recovery, not for code. Scope is unchanged.

**UI redesign (agreed 21/10).** The web app gets one visual design, *Sticker pop*, specified in
[DESIGN.md](DESIGN.md): light and dark themes, a Tổng quan that opens with "who pays whom", a device-only
"Bạn là ai?" choice and a copyable reminder message for the group chat. It is frontend only (no API
change) and lands before the freeze as T-41 → T-42 → T-43, with T-19 and T-32 built on top.

| Milestone (GitHub) | Dates | Brief requirement | Exit criteria |
|---|---|---|---|
| **W7 · Foundation & cloud database** | Fri 16/10 → **Thu 22/10** | Managed cloud DB attached by one env var | Vertical slice live: households and members in the React app → API → Supabase, over HTTPS. Compose runs `db` + `api` + `web` from a clean clone. CI has `backend` (real PostgreSQL), `frontend`, `images` jobs |
| **W8 · Features & AI live** | Fri 23/10 → **Wed 28/10** | AI feature working on the live URL, failure handled | Every MVP user story US-01…US-10 on the live URL, including the balances dashboard and Quick add with its fallback; secret audit and keep-alive in place; report section drafts written |
| **W9 · Hardening & freeze** | Thu 29/10 → **Sun 01/11** | Secret audit, peer-review findings as issues, report draft with 8 sections | Peer-review findings filed and fixed; persistence drill done; diagrams match the deployment; full report draft; **feature freeze Sun 01/11 23:59** |
| **W10 · Report & rehearsal** | Mon 02/11 → Wed 11/11 | Rehearsed demo, submitted report | Only bug fixes on `main`; two clean-clone rehearsals; report PDF **submitted Sun 08/11**; two timed rehearsals; 09–11/11 kept free for recovery |
| **Session 20** | **Thu 12/11** | Assessment | Live demo, presentation, individual defense |

```mermaid
gantt
    dateFormat  YYYY-MM-DD
    title Fair-Share — accelerated plan (freeze 1 Nov)
    section Backend (Hoàng Minh)
    Fix #84, merge T-08               :crit, b1, 2026-10-20, 2d
    T-15 expenses → T-16 → T-17       :crit, b2, 2026-10-22, 5d
    T-25 validation + error contract  :b3, 2026-10-26, 3d
    T-27 persistence drill            :b4, 2026-10-29, 3d
    T-28 diagrams                     :b5, 2026-10-29, 2d
    section Frontend (Duy Anh)
    T-18 expenses page                :f1, 2026-10-21, 6d
    T-20 dashboard                    :f2, 2026-10-26, 2d
    T-19 AI quick add UI              :f3, 2026-10-26, 3d
    T-32 polish, T-33 Playwright      :f4, 2026-10-29, 4d
    section Platform & AI (Việt Tiến)
    Gemini key + T-21 client          :crit, a1, 2026-10-20, 3d
    T-22 AI endpoint                  :crit, a2, 2026-10-23, 3d
    T-26 keep-alive, T-29 secret audit:p1, 2026-10-23, 5d
    T-41 design system                :d1, 2026-10-21, 2d
    T-42 UI foundation                :crit, d2, 2026-10-22, 3d
    T-43 Tổng quan + Chi tiêu UI      :d3, 2026-10-25, 4d
    T-31 report draft assembled       :r1, 2026-10-29, 4d
    section Freeze, report, rehearsal
    Feature freeze                    :milestone, 2026-11-01, 0d
    Report final + PDF                :r2, 2026-11-02, 7d
    Rehearsals + buffer               :crit, r3, 2026-11-03, 9d
    Session 20                        :milestone, 2026-11-12, 0d
```

### Critical path

`#84 fix (T-08)` → `T-15 expenses` → `T-16 settlements` → `T-17 balances` → `T-18/T-20 pages wired to the
real API` → live check → freeze. The AI path runs beside it: `Gemini key` → `T-21` → `T-22` (needs T-08
merged for member names) → `T-19`. Anything late on these two chains moves the freeze; everything else has
slack. The UI work is a third, short chain: `T-41` → `T-42` (by Sat 24/10) → `T-19`'s form interface (#104) → `T-43`; T-42 is
on it because the composer and both redesigned screens use its components.

### Rules that make the acceleration work

1. **Stacked backend PRs.** The branches are built on each other: `feat/27` (#84) → `feat/34` (T-15) →
   `feat/35` (T-16) → `feat/36` (T-17). Open each PR with the previous branch as its base. Merge one, wait
   until GitHub shows the next PR's base as `main`, re-run its checks, then merge it. Never merge two of
   them within a minute of each other (that is how #62 landed on the wrong branch).
2. **Build against the contract, wire up on merge.** The API shapes in ARCHITECTURE.md §5 are the
   contract. Duy Anh builds T-18/T-20 against it with test fixtures and connects the real endpoint the
   day it is merged; a page is *done* only when it works on the live URL.
3. **Checkpoints and takeover.** Each P0 task below has a date. If a checkpoint slips and the owner cannot
   show a way back within 24 h, Việt Tiến pairs on it first and takes over a bounded part only if that is
   still not enough; the takeover is noted in the issue so the contribution table stays honest.
   Pre-agreed triggers: #84 not merged by **Thu 22/10** · T-17 without a green PR by **Mon 26/10** ·
   T-18 not merged by **Tue 27/10**.
4. **Live check every evening (Thu 22/10 → Sun 01/11):** the leader opens the web app, runs one expense
   end to end and posts *OK / broken + issue link* in the team chat.
5. **After the freeze** only issues labelled `type:bug` are merged; everything else waits for after
   Session 20.

## 3. Weekly plan by member

**P0** = needed for a passing demo · **P1** = needed for a strong grade · **P2** = nice to have.
*Due* is the date the task is merged (or done, for non-code tasks).

### Week 7 · Foundation & cloud database (16/10 → Thu 22/10)

| ID | Task | Owner | Reviewer | Pri | Due |
|---|---|---|---|---|---|
| T-01 | Project spec, architecture, roadmap, contributing guide, PR/issue templates | Việt Tiến | Hoàng Minh | P0 | ✅ |
| T-02 | Each member completes their own row in `TEAM.md` (name, student ID, GitHub) | **All** (own commit each) | Việt Tiến | P0 | ✅ |
| T-03 | Close stale lab PRs #3 and #5, delete merged lab branches, set up labels, milestones and the project board | Việt Tiến | Duy Anh | P1 | ✅ |
| T-04 | API Dockerfile hardening: Python 3.12 in Dockerfile and CI, pinned deps, non-root user | Việt Tiến | Hoàng Minh | P0 | ✅ |
| T-05 | Supabase attached through `DATABASE_URL` (session pooler, TLS), `/health/db` on the live URL | Việt Tiến | Hoàng Minh | P0 | ✅ |
| T-06 | Restructure backend: `config.py`, `db.py` pool, routers, error format, safe `/health/db` errors | Hoàng Minh | Việt Tiến | P0 | ✅ |
| T-07 | Schema v1 (`001_init.sql`), start-up migration runner (transaction per file + advisory lock), `seed.sql` | Hoàng Minh | Việt Tiến | P0 | ✅ |
| T-08 | Households & members API + tests (#84: commit before the response is sent) | Hoàng Minh | Duy Anh | P0 | ✅ |
| T-09 | Scaffold `frontend/`: Vite + React + TS, React Router, lint, Vitest, typed API client | Duy Anh | Việt Tiến | P0 | ✅ |
| T-10 | Web image: multi-stage `frontend/Dockerfile` (node build → nginx) + `nginx.conf` proxying `/api` | Duy Anh | Việt Tiến | P0 | ✅ |
| T-11 | Compose: `db` + `api` + `web` with one command from a clean clone | Duy Anh | Hoàng Minh | P0 | ✅ |
| T-12 | Households list/create page + members page (the W7 vertical slice) | Duy Anh | Hoàng Minh | P0 | ✅ |
| T-13 | CI: `backend` job with a PostgreSQL service, `frontend` job, `images` job | Việt Tiến | Hoàng Minh | P0 | ✅ |
| T-14 | Render Static Site for the SPA (rewrite rule, `VITE_API_BASE_URL`, `ALLOWED_ORIGINS`) | Việt Tiến | Duy Anh | P0 | ✅ |

### Week 8 · Features & AI live (Fri 23/10 → Wed 28/10) — some tasks start 20–22/10

| ID | Task | Owner | Reviewer | Pri | Due |
|---|---|---|---|---|---|
| T-15 | Expenses API: equal & custom split, exact-remainder rule, edit/delete + tests | Hoàng Minh | Việt Tiến | P0 | ✅ |
| T-16 | Settlements API + tests | Hoàng Minh | Duy Anh | P0 | ✅ |
| T-17 | Balances endpoint + suggested settlements (greedy, ≤ n−1 transfers) + property tests | Hoàng Minh | Việt Tiến | P0 | ✅ |
| T-25 | Validation & errors: one error JSON, 404/409/422 cases, input limits — the contract the pages rely on | Hoàng Minh | Duy Anh | P1 | ✅ |
| T-18 | Expenses page: list, add/edit/delete form with equal/custom split | Duy Anh | Hoàng Minh | P0 | ✅ |
| T-20 | Dashboard: balances, suggested settlements, "record this payment" | Duy Anh | Hoàng Minh | P0 | ✅ |
| T-19 | AI quick-add box: draft preview → confirm; 429 / 503 / 422 / not-configured fall back to the manual form — built on the T-42 components, states in [DESIGN.md §6.3](DESIGN.md#63-chi-tiêu-householdsidexpenses); owns the form's AI-fill interface ([§9](DESIGN.md#9-implementation-plan)), shipped in #104 so T-43 builds on it | Duy Anh | Việt Tiến | P0 | ✅ |
| T-41 | Design system "Sticker pop": [DESIGN.md](DESIGN.md) — rules, light/dark tokens with measured contrast, type, components, screen specs, copy | Việt Tiến | Duy Anh | P1 | ✅ |
| T-42 | UI foundation: tokens, fonts, base CSS, shared components (avatar, money, chips, buttons, toast), "Bạn là ai?"; Danh sách nhà, household frame, Thành viên | Việt Tiến | Duy Anh | P1 | ✅ |
| T-43 | UI screens: Tổng quan (verdict block, Đã trả + stamp + undo, reminder message), Chi tiêu form defaults and list | Việt Tiến | Duy Anh | P1 | ✅ |
| T-44 | Brand kit: [BRAND.md](BRAND.md) — tagline, logo and icon, colour and voice rules, OG image, README header, slide and report templates | Việt Tiến | Duy Anh | P1 | ✅ |
| T-21 | Gemini client service: structured JSON output, 10 s timeout, 429/5xx mapping, key from env, never logged (key on Render by Wed 21/10) | Việt Tiến | Hoàng Minh | P0 | ✅ |
| T-22 | `POST /api/households/{id}/ai/parse-expense`: per-IP limit + global budget, name matching, tests with mocked Gemini | Việt Tiến | Hoàng Minh | P0 | ✅ |
| T-23 | Deploy job calls both hooks; CORS checked from the live SPA (done 20/10); first merge after #85 deploys both | Việt Tiến | Duy Anh | P0 | ✅ |
| T-24 | Post-deploy smoke job: live commit = merged SHA; web URL serves the SPA | Việt Tiến | Hoàng Minh | P0 | ✅ |
| T-26 | Keep-alive: daily scheduled workflow querying the DB through `/health/db` *(moved to Việt Tiến, platform)* | Việt Tiến | Hoàng Minh | P1 | ✅ |
| T-29 | Secret audit: gitleaks CI job, full-history scan, secret scanning + push protection, findings written up *(pulled forward)* | Việt Tiến | Duy Anh | P0 | ✅ |

### Week 9 · Hardening & freeze (Thu 29/10 → Sun 01/11)

| ID | Task | Owner | Reviewer | Pri | Due |
|---|---|---|---|---|---|
| T-30 | Peer review session in class: each member reviews another's area; every finding becomes an issue labelled `peer-review` | **All** | — | P0 | **Thu 29/10** |
| T-27 | Persistence drill: `pg_dump` of Supabase, restore into local Compose, restart and redeploy the Render API → data still there; written up for report §5 | Hoàng Minh | Việt Tiến | P0 | Sat 31/10 |
| T-28 | Architecture & ER diagrams exported for the report, checked against Render and Supabase | Hoàng Minh | Việt Tiến | P0 | ✅ |
| T-32 | UI polish: loading / empty / error states ([DESIGN.md §6.5](DESIGN.md#65-states-on-every-screen)), 360 px and 200% zoom pass, dark-mode pass, one UI language | Duy Anh | Việt Tiến | P1 | ✅ |
| T-33 | Browser smoke test (Playwright) of the main flow against the live URL | Duy Anh | Việt Tiến | P2 | ✅ |
| T-45 | Stretch: filter Chi tiêu by month and member, each member's total for the month *(added 22/10)* | Duy Anh | Việt Tiến | P2 | Sun 01/11 · 🚧 approved, to merge (#122) |
| T-46 | Stretch: export a household's expenses as CSV (Excel and Google Sheets, Vietnamese text) *(added 22/10)* | Duy Anh | Hoàng Minh | P2 | ✅ |
| T-31 | Report draft — all 8 sections assembled (section drafts due Wed 28/10, owners in §4) | Việt Tiến (editor) | All | P0 | **Sun 01/11** |

### Week 10 · Report & rehearsal (Mon 02/11 → Wed 11/11) — no new features

| ID | Task | Owner | Reviewer | Pri | Due |
|---|---|---|---|---|---|
| T-35 | Demo branch `demo/red-gate` with a deliberate failing test, ready but never merged | Hoàng Minh | Việt Tiến | P0 | Mon 02/11 |
| T-39 | Final README: live URLs, architecture image, run/test instructions, badges (start in W9) | Hoàng Minh | Duy Anh | P1 | Mon 02/11 |
| T-34 | Clean-clone rehearsal on a machine that never had the project; write the exact steps | Duy Anh | Việt Tiến | P0 | #1 Tue 03/11 · final Mon 09/11 |
| T-38 | Demo-day runbook: wake service, resume DB, repo key search, fallback recording | Việt Tiến | Hoàng Minh | P0 | Wed 04/11 |
| T-37 | Slides + timed 10-minute rehearsals | Duy Anh | All | P0 | #1 Thu 05/11 · #2 Tue 10/11 |
| T-36 | Final report PDF (≤ 12 pages) + contribution table signed by all, cross-checked with `git shortlog`: content and signatures Fri 06/11, PDF checked Sat 07/11 | Việt Tiến | All | P0 | **Submit Sun 08/11** |
| — | Buffer: recovery, a second look at the live demo, wake the services, resume Supabase | All | — | — | 09–11/11 |

### Load check (planned issues per member, from 20/10)

| Member | W7 left | W8 | W9 | W10 | Open total |
|---|---|---|---|---|---|
| Việt Tiến | 1 | 10 | 1 | 2 | 14 |
| Hoàng Minh | 1 | 4 | 2 | 2 | 9 |
| Duy Anh | 0 | 3 | 2 | 2 | 7 |

Hoàng Minh carries the critical path in W8, so his W9–W10 tasks are small and documentation-heavy. Việt
Tiến takes T-26 (platform) and the takeover duty in §2. Shared tasks (T-30) are not counted. The UI
redesign and brand (T-41–T-44, added 21/10) goes to Việt Tiến because his W8 backend and platform tasks are done;
Duy Anh keeps T-19 and T-32 and reviews the redesign.

## 4. Report ownership (15% — section drafts Wed 28/10, full draft Sun 01/11, PDF submitted Sun 08/11)

| # | Required section | Writer | Source material |
|---|---|---|---|
| 1 | Platform selection rationale | Việt Tiến | ARCHITECTURE.md §7 |
| 2 | System architecture (diagram = deployment) | Hoàng Minh | ARCHITECTURE.md §1–2, T-28 |
| 3 | Dockerfile & Compose explained | Duy Anh | Both Dockerfiles, `compose.yml`, ARCHITECTURE.md §2 |
| 4 | CI/CD pipeline walkthrough (with evidence it blocked something) | Việt Tiến | Workflow file, red PR history |
| 5 | Database schema & integration (restart and pause) | Hoàng Minh | ARCHITECTURE.md §4, migrations, T-27 drill |
| 6 | AI API integration (where, key, limits, 429 behaviour) | Việt Tiến + Duy Anh (UI screenshots) | ARCHITECTURE.md §6 |
| 7 | Secret & configuration management + leak runbook | Việt Tiến | ARCHITECTURE.md §8, T-29 findings |
| 8 | Individual contribution table (signed) | Việt Tiến compiles, all sign | `git shortlog -sn --no-merges`, closed issues, reviews |

## 5. Presentation (10 minutes) and individual defense

| Block | Time | Owner |
|---|---|---|
| What the app does, and for whom | 1 min | Duy Anh |
| Architecture: components and how they communicate | 2 min | Hoàng Minh |
| Live demo (wake → clean clone → red gate → merge → live → key search) | 4 min | Việt Tiến drives; Duy Anh runs the clean clone |
| One thing that went wrong and how we fixed it | 2 min | Hoàng Minh |
| What we would do differently | 1 min | Duy Anh |

**Defense preparation — every member must be able to answer every question; the owner goes deepest:**

| Expected question | Việt Tiến | Hoàng Minh | Duy Anh |
|---|---|---|---|
| A commit you made, what and why | CI/deploy, AI client | migrations, balances | SPA, AI fallback UI |
| Why is this Dockerfile instruction before that one? | API Dockerfile (owner) | API Dockerfile | Web Dockerfile (owner) |
| Where does `DATABASE_URL` come from in production, who can see it? | Render env, secrets (owner) | pooler URL, migrations | how the SPA never sees it |
| What happens if the AI API returns 429 right now? | server mapping + limits (owner) | error JSON, nothing written to the DB | UI fallback (owner) |
| The pipeline is red — how do you find out why? | whole workflow (owner) | `backend` job | `frontend` / `images` jobs |

## 6. Cadence

* **Weekly planning:** Friday after class (15 min) — move issues into the week's milestone, check load.
* **Async stand-up:** team chat by 21:00 on Mon/Wed/Fri — *done / doing / blocked*.
* **Review SLA:** a PR waits at most 24 h for a review; ping the reviewer after that.
* **Thursday check:** the live URL must show that week's milestone; collect evidence (PR links,
  screenshots without secrets) into `docs/evidence/` for the report.

## 7. Risks

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Render cold start (~50 s) during the demo | High | Medium | Open the URL 5 min before; the smoke test also warms it | Việt Tiến |
| Supabase paused for inactivity | Medium | High | Daily keep-alive (T-26); resume from the dashboard the day before and the morning of the demo; own `pg_dump` (T-27) | Hoàng Minh |
| Gemini quota / 429 during the demo | Medium | Low | Fallback UX is part of the demo; per-IP limit + global budget; Groq fallback documented | Việt Tiến |
| Renaming CI jobs leaves `check` required and blocks every PR | Medium | High | Swap required checks in the same sitting (T-13, ARCHITECTURE §9) | Việt Tiến |
| Clean clone fails on a fresh machine (Windows/Podman quirks) | Medium | High | First run in W7 (T-11), final rehearsal in W10 (T-34); README tested by someone who didn't write it | Duy Anh |
| A secret is committed | Low | High | gitleaks in CI, push protection, `.env` git-ignored, runbook in ARCHITECTURE §8 | Việt Tiến |
| Unequal or unexplainable contributions | Medium | High | Issues assigned evenly; every PR explained in its description; defense table above | Việt Tiến |
| Scope creep | Medium | Medium | MVP fixed in PROJECT_SPEC §3.1; stretch goals only after W8 is green; freeze Sun 01/11 | Việt Tiến |
| The redesign (T-42/T-43) and T-19/T-32 edit the same pages and CSS | Medium | Medium | T-42 merges first (Sat 24/10); one design spec ([DESIGN.md](DESIGN.md)); Duy Anh reviews the redesign PRs, Việt Tiến reviews T-19/T-32; tests updated with the copy they check | Việt Tiến |
| The backend chain (T-08 → T-15 → T-16 → T-17) slips and moves the freeze | Medium | High | Dated checkpoints and takeover triggers in §2; Duy Anh builds pages against the §5 contract meanwhile | Việt Tiến |
| Stacked backend PRs merged out of order or onto the wrong base | Medium | Medium | Merge one at a time and wait for the next PR to show base `main` (§2, rule 1) | Hoàng Minh |
| Takeovers make the contribution table hard to explain | Low | Medium | Pair first, take over only a bounded part, note it in the issue; each member keeps the code they defend | Việt Tiến |
