# Fair-Share

[![CI/CD](https://github.com/NeitLN/Fair-Share/actions/workflows/ci-cd.yml/badge.svg?branch=main)](https://github.com/NeitLN/Fair-Share/actions/workflows/ci-cd.yml)
[![Live API](https://img.shields.io/website?url=https%3A%2F%2Ffair-share-4bu9.onrender.com%2Fhealth&label=live%20API)](https://fair-share-4bu9.onrender.com/health)
![FastAPI](https://img.shields.io/badge/FastAPI-009688)
![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16-4169E1)

**Fair-Share** is a three-tier web application for housemates, being built for Session 20
(12 Nov 2026): record shared expenses, split each one between the people who took part, and see at any
moment **who owes whom** and a short list of transfers that settles everything. Its one AI-assisted
feature, **Quick add**, will turn a sentence such as *"dinner 240k, Minh paid, split 3 ways"* into a
pre-filled expense form that the user confirms.

> **Where we are (Week 7):** the platform is in place: Docker image, Compose stack, live HTTPS deployment
> on Render backed by **Supabase PostgreSQL**, and a GitHub Actions pipeline that blocks a bad merge,
> deploys a good one and proves which commit is live. The running app is still the course's FastAPI
> starter; the expense features, the React app and the AI feature arrive in Weeks 7–8
> ([project status](#project-status)).

Final project for **72ITDS30103 Software Development Platforms**, Van Lang University, Semester 261.
What is assessed is the platform pipeline around the application: container, Compose stack, CI/CD,
managed database and a server-side AI call ([assessment checklist](#assessment-checklist)).

| | |
|---|---|
| 🌐 **Live API** | https://fair-share-4bu9.onrender.com · interactive docs at [`/docs`](https://fair-share-4bu9.onrender.com/docs) |
| 🖥️ **Web app** | **https://fair-share-web.onrender.com** (Render Static Site) |
| 📈 **Progress** | [**Dashboard**](https://neitln.github.io/Fair-Share/) · [Project board](https://github.com/users/NeitLN/projects/2) · [milestones](https://github.com/NeitLN/Fair-Share/milestones) · [weekly reports](https://github.com/NeitLN/Fair-Share/issues?q=label%3Aweekly-report) · [how to follow it](#project-status) |
| 📄 **Docs** | [Specification](docs/PROJECT_SPEC.md) · [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md) · [Contributing](CONTRIBUTING.md) |

> The free Render instance sleeps after ~15 minutes without traffic. The first request after that can
> take about 50 seconds; later requests are fast.

## Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Tech stack](#tech-stack)
4. [Quick start (Docker Compose)](#quick-start-docker-compose)
5. [Configuration](#configuration)
6. [Development without Docker](#development-without-docker)
7. [API](#api)
8. [Testing and quality](#testing-and-quality)
9. [CI/CD pipeline](#cicd-pipeline)
10. [Deployment](#deployment)
11. [Security and secrets](#security-and-secrets)
12. [Repository layout](#repository-layout)
13. [Troubleshooting](#troubleshooting)
14. [Project status](#project-status)
15. [Assessment checklist](#assessment-checklist)
16. [Team and workflow](#team-and-workflow)

## Features

| | Feature | Status |
|---|---|---|
| 🏠 | Households and their members | Week 7 |
| 💸 | Expenses in VND with **equal** or **custom** split (shares always add up to the exact amount) | Week 8 |
| ⚖️ | Balances per member (paid, owed, net) and **suggested settlements** (at most *n − 1* transfers) | Week 8 |
| 🤝 | Record a settlement ("A paid B 120 000 ₫") | Week 8 |
| ✨ | **Quick add (AI):** free-text sentence → pre-filled form via the Google Gemini API, called only from our server | Week 8 |
| 🛟 | **AI failure fallback:** on 429, timeout or no key the user keeps their text and fills in the normal form; nothing breaks | Week 8 |

Out of scope by design: user accounts, payments, receipts/images, real-time updates.
**Known limitation:** there is no login, so anyone with the URL can edit any household; acceptable for a
classroom demo and discussed in the report. See [PROJECT_SPEC.md §3](docs/PROJECT_SPEC.md#3-scope) for the
user stories and acceptance criteria.

## Architecture

Target architecture for Session 20. Live today: the web app (Render Static Site), the API on Render,
Supabase and the pipeline. Gemini arrives in Week 8.

```mermaid
flowchart LR
    U["Browser / phone"] -- HTTPS --> WEB["React SPA<br/>Render Static Site"]
    U -- "HTTPS · JSON /api/*" --> API["FastAPI in Docker<br/>Render Web Service"]
    API -- "SQL over TLS · DATABASE_URL" --> DB[("Supabase<br/>PostgreSQL")]
    API -- "HTTPS · GEMINI_API_KEY" --> AI["Google Gemini API"]
    GH["GitHub Actions"] -- "deploy hook" --> API
    GH -- "deploy hook" --> WEB
```

* The browser only ever receives static files and JSON. **The database connection string and the AI key exist
  only on the API server.**
* Locally, Docker Compose runs the same API image next to a `postgres:16-alpine` container.
* Full description, data model, sequence diagram of the AI call and platform trade-offs:
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech stack

| Layer | Technology | Where it runs |
|---|---|---|
| Presentation | React + TypeScript + Vite | Render Static Site (CDN, HTTPS) |
| Application | Python 3.12 (same in the image and in CI), FastAPI, Uvicorn, psycopg 3 | Docker container on a Render Web Service, non-root |
| Data | PostgreSQL 16 | Supabase (cloud) · `postgres:16-alpine` (local) |
| AI | Google Gemini API, structured JSON output | Called from the API only |
| CI/CD | GitHub Actions → Render deploy hooks | GitHub-hosted runners |
| Quality | ruff, pytest, oxlint, Vitest | Locally and in CI |

Every platform is on a free tier that needs **no credit card**. Fallbacks are declared in
[ARCHITECTURE.md §7](docs/ARCHITECTURE.md#7-platform-selection-and-declared-fallbacks-zero-credit-card).

## Quick start (Docker Compose)

**Requirements:** Git and Docker Desktop, or Podman 4+ with a compose provider. Nothing else: Node,
Python and PostgreSQL run inside containers.

```bash
git clone https://github.com/NeitLN/Fair-Share.git
cd Fair-Share
docker compose up --build
```

That is all: no `.env` is needed. The local database gets a throw-away default password. To use your
own, copy `.env.example` to `.env` (PowerShell: `Copy-Item .env.example .env`) and set `DB_PASSWORD`
to letters and digits only (it is placed inside a URL, where `@` or `:` would break it).

This starts three containers, in this order: `db` (PostgreSQL) → `api` (FastAPI) once the database is
healthy → `web` (nginx serving the React app) once the API is healthy. The first build takes a few
minutes; later starts take seconds.

| Check | URL | Expected |
|---|---|---|
| **Web app** | http://localhost:3000 | The Fair-Share page |
| Web app reaches the API through nginx | http://localhost:3000/api/version | `{"app":…,"version":…}` |
| API is alive | http://localhost:8000/health | `{"status":"ok"}` |
| API reaches PostgreSQL | http://localhost:8000/health/db | `{"db":"ok","schema":"001_init"}` (the latest migration) |
| Interactive API docs | http://localhost:8000/docs | Swagger UI |

The browser only ever talks to `web` on port 3000; nginx forwards `/api/...` to the `api` container.
Port 8000 is published so you can open `/docs` while developing.

```bash
docker compose down        # stop, keep the data
docker compose down -v     # stop AND permanently delete the local database volume (fresh start)
```

The API creates the schema itself: at every start it applies any new file in
[`db/migrations/`](db/migrations) (each exactly once, recorded in `schema_migrations`), then adds a demo
household with three members if the database is empty ([`db/seed.sql`](db/seed.sql), Compose only).
Your data survives `docker compose down` and later starts; `down -v` gives you the demo household again.

## Configuration

All configuration comes from **environment variables**; nothing environment-specific is hard-coded.
[`.env.example`](.env.example) is the template. Copy it to `.env`, which is git-ignored. Compose reads
`.env` to fill `${DB_PASSWORD}` in [`compose.yml`](compose.yml).

**Read by the code today**

| Variable | Read by | Local (Compose) | Production (Render) | Secret? |
|---|---|---|---|---|
| `DB_PASSWORD` | `compose.yml` (`db` service and the URL below) | `.env` | — | yes |
| `DATABASE_URL` | `app/config.py` | built in `compose.yml` from `DB_PASSWORD` | service env var (Supabase session pooler, `sslmode=require`) | **yes** |
| `APP_NAME` | `app/config.py` (default `sdp-starter`) | not forwarded by Compose, so the default is used | service env var | no |
| `APP_ENV` | `app/config.py` (default `development`) | not forwarded, default | `production` | no |
| `SEED_DEMO_DATA` | `app/config.py` (default off) | `true` in `compose.yml`: demo household in an empty database | **not set** | no |
| `PORT` | the container's start command (default `8000`) | default | set by Render | no |

**Added with upcoming features**

| Variable | For | Where it will live | Secret? |
|---|---|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | AI Quick add (Week 8) | Render env var; optional local `.env` (without it Quick add says "not configured") | key: **yes** |
| `ALLOWED_ORIGINS` | CORS: the web app's origin, `https://fair-share-web.onrender.com` | Render env var (API) | no |
| `VITE_API_BASE_URL` | SPA build: the API's URL, baked into the JavaScript | Render static site env var | no, public |
| `RENDER_DEPLOY_HOOK_API` / `_WEB` | deploy job | GitHub Actions secrets | **yes** |

The full matrix, including CI, is in
[ARCHITECTURE.md §8](docs/ARCHITECTURE.md#8-configuration-and-secrets).

## Development without Docker

Useful for fast lint and test runs. CI uses **Python 3.12**; use the same version locally.

```bash
python -m venv .venv
source .venv/bin/activate            # Windows PowerShell: .\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt

ruff check .                         # lint
pytest -q                            # tests
uvicorn app.main:app --reload        # API on http://localhost:8000
```

Python does not read `.env` by itself. For `/health/db` to work outside Compose, start a throw-away
PostgreSQL with a published port and set `DATABASE_URL` in your shell (the API, and the tests, apply
the migrations to it):

```bash
docker run -d --name fs-dev-db -p 5432:5432 \
  -e POSTGRES_USER=app -e POSTGRES_PASSWORD=devonly -e POSTGRES_DB=appdb postgres:16-alpine
export DATABASE_URL=postgresql://app:devonly@localhost:5432/appdb
# PowerShell: $env:DATABASE_URL = "postgresql://app:devonly@localhost:5432/appdb"
python -m app.migrate                # optional: apply the migrations without starting the API
```

(The Compose `db` service does not publish a port, on purpose: only the API container talks to it.)

## API

FastAPI publishes an always-current reference at **`/docs`** (Swagger UI) and **`/openapi.json`**.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness for Render and the pipeline; never touches the database |
| `GET` | `/health/db` | Readiness: runs one query against PostgreSQL; `503` with a safe message if it cannot (details in the server log) |
| `GET` | `/` | Name, version and environment of the running app |
| `GET` | `/api/version` | Name, version, environment and the **commit** Render built; used by the post-deploy smoke test |

| `GET` `POST` | `/api/households` | List (newest first) / create a household: `{"name"}`, 1–60 characters → `201` |
| `GET` `PATCH` `DELETE` | `/api/households/{id}` | One household; delete removes everything in it → `204` |
| `GET` `POST` | `/api/households/{id}/members` | Members (oldest first) / add one: `{"name"}`, 1–40 characters → `201`; `409 member_name_taken` |
| `PATCH` `DELETE` | `/api/members/{id}` | Rename / remove; `409 member_in_use` if they are in an expense or a settlement |

| `GET` `POST` | `/api/households/{id}/expenses` | List (newest first) / add an expense with an equal or custom split → `201`; `422 split_mismatch` if custom shares do not add up |
| `GET` `PUT` `DELETE` | `/api/expenses/{id}` | One expense with its shares; edit replaces it; delete → `204` |
| `GET` `POST` | `/api/households/{id}/settlements` | List (newest first) / record "A paid B x đồng" → `201`; `422 same_member` if A = B |
| `DELETE` | `/api/settlements/{id}` | Undo a mistaken settlement → `204` |
| `GET` | `/api/households/{id}/balances` | Each member's paid / owed / net (nets sum to 0) and the suggested transfers that settle everyone |

Still to come: `POST /api/households/{id}/ai/parse-expense`, which returns a draft and never saves it. Request/response
shapes and error codes are in [ARCHITECTURE.md §5](docs/ARCHITECTURE.md#5-api-json-prefix-api).

## Testing and quality

| Tool | Command | Covers | Status |
|---|---|---|---|
| ruff | `ruff check .` | Python style, unused imports, likely bugs, import order | in CI |
| pytest | `pytest -q` | Health and version endpoints, the error format, `/health/db` with no or an unreachable database | in CI |
| pytest + PostgreSQL | `pytest -q` with `DATABASE_URL` set | Tests marked `db`: migrations (fresh, repeated, failing, concurrent), the schema's rules, the seed, `/health/db`; skipped locally without a database, never skipped in CI | in CI |
| Docker | `docker build .` then run and call `/health` | The image Render will run builds **and** starts | in CI |
| oxlint / Vitest | `npm run lint` · `npm test` in `frontend/` | SPA lint, API client and route tests; `npm run build` type-checks | in CI |

A pull request is merged only when these pass in CI **and** another team member has approved it.

## CI/CD pipeline

Defined in [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml).

```mermaid
flowchart LR
    PR["Pull request"] --> B["backend<br/>ruff + pytest + PostgreSQL"]
    PR --> F["frontend<br/>lint + test + build"]
    PR --> I["images<br/>docker build + /health"]
    B & F & I --> R{"all green<br/>+ 1 approval?"}
    R -- "merge to main" --> D["deploy<br/>Render deploy hook(s)"]
    D --> S["smoke<br/>live commit = merged commit"]
```

| Job | Runs on | What it does | What it keeps out of `main` |
|---|---|---|---|
| `backend` | every PR and merge | Applies the migrations to a fresh PostgreSQL 16 service container, then `ruff check .` and `pytest -q` against it | Lint errors, broken endpoints, migrations or SQL that fail on a real database |
| `frontend` | every PR and merge | `npm ci`, lint, test, build in `frontend/` (passes with a notice until `frontend/` exists) | A SPA that does not type-check, test or build |
| `images` | every PR and merge | Builds both images; checks the API container answers `/health` and the web container serves the SPA and a deep link | A Dockerfile that breaks, or a container that crashes on start |
| `deploy` | merge to `main` only | Calls the Render deploy hook through [`render-deploy.sh`](.github/scripts/render-deploy.sh), which refuses a hook from another service and prints the deploy id | Deploying anything that has not passed all checks |
| `smoke` | after `deploy` | Polls `/api/version` until the live commit equals the merged commit (10 min cap) | A deploy that silently never goes live |

* Branch protection on `main` requires `backend`, `frontend` and `images` plus one approving review, for
  administrators too. A deliberately failing test was blocked in Lab 4; the demo branch for Session 20 is
  task T-35.
* Render's auto-deploy is off, so only a green pipeline deploys.
* **Incident, 15 Oct:** the first `smoke` run went red. The deploy hook secret belonged to another Render
  service, so `deploy` had been green while production stayed on an old commit. Fixed by replacing the
  secret and checking the service id in the script ([#64](https://github.com/NeitLN/Fair-Share/pull/64)).

## Deployment

| Piece | Platform | How it gets there |
|---|---|---|
| API | Render Web Service, Docker, free instance | GitHub Actions calls the deploy hook; Render builds the root [`Dockerfile`](Dockerfile) |
| Web app | Render Static Site `fair-share-web`, rewrite `/* → /index.html`, auto-deploy off | Same pipeline, second deploy hook (`RENDER_DEPLOY_HOOK_WEB`); `smoke` checks `WEB_URL` serves the SPA |
| Database | Supabase PostgreSQL (Singapore, free tier) | Attached to the API with a single `DATABASE_URL` env var (session pooler, TLS); Row Level Security on, so Supabase's public REST API cannot read the tables |

Before a demo: open the live URL a few minutes early to wake the instance, and check the Supabase
dashboard, *resuming* the project if it was paused for inactivity.

## Security and secrets

**Rules we follow**

* Keys, passwords and connection strings are never committed. `.env` and `.env.*` are git-ignored; only
  `.env.example`, with empty values, is in the repository.
* Production secrets live in **Render environment variables**; the deploy hook lives in **GitHub Actions
  secrets** and is masked in logs.
* The AI key will be used only by the API server, never sent to the browser or written to logs. CI will
  not need it: the AI tests mock the HTTP call.
* Screenshots for the report are checked for keys and URLs before they are added.
* If a secret leaks: revoke it at the provider, issue a new one, update Render/GitHub, then clean the
  history. Full runbook in [ARCHITECTURE.md §8](docs/ARCHITECTURE.md#8-configuration-and-secrets).

**How we check it:** the `secrets` CI job runs gitleaks on the whole history for every pull request and
merge, and GitHub secret scanning with push protection blocks known provider keys on push. The full audit
of 20 Oct 2026 (119 commits, all branches: no leaks) is in [docs/SECRET_AUDIT.md](docs/SECRET_AUDIT.md).

Found a security problem? Open an issue **without** the secret in it, or tell the team leader directly.

## Repository layout

```
Fair-Share/
├── app/                  # FastAPI application (API image)
│   ├── main.py           # create_app(): start-up/shut-down, error handlers, routers
│   ├── config.py         # Settings read from environment variables
│   ├── db.py             # psycopg connection pool + get_conn dependency
│   ├── errors.py         # ApiError and the {"error": {code, message}} format
│   ├── migrate.py        # applies db/migrations at start-up (also: python -m app.migrate)
│   ├── schemas.py        # request/response bodies (Pydantic), limits = the database's CHECKs
│   ├── routers/          # system, households, members, expenses, settlements, balances
│   └── services/         # pure logic, unit-tested: splitting.py, balances.py
├── db/
│   ├── migrations/       # 001_init.sql, ...: applied once each, never edited afterwards
│   └── seed.sql          # demo household for the local Compose stack
├── tests/                # pytest
├── frontend/             # React + TypeScript + Vite SPA
│   ├── src/              # api/ (client), pages/, lib/
│   ├── Dockerfile        # web image: node build → nginx (Compose only)
│   └── nginx.conf        # SPA fallback, /api proxy, asset caching
├── docs/                 # specification, architecture, roadmap
├── .github/
│   ├── workflows/ci-cd.yml
│   ├── ISSUE_TEMPLATE/
│   └── pull_request_template.md
├── Dockerfile            # API image (the one Render builds)
├── compose.yml           # local stack: web (nginx + SPA) + api + PostgreSQL
├── requirements.txt      # runtime dependencies
├── requirements-dev.txt  # + pytest, ruff
├── pyproject.toml        # ruff and pytest configuration
└── .env.example          # local configuration template
```

Target layout, with the routers and services still to come:
[ARCHITECTURE.md §3](docs/ARCHITECTURE.md#3-repository-layout-target).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `/health/db` → `503 database_unavailable` | The API cannot reach PostgreSQL. The reason is in `docker compose logs api`; the two usual ones follow |
| `docker compose logs api` mentions password authentication | Usually `DB_PASSWORD` changed after the volume was created; PostgreSQL keeps the first password. For a disposable local database: `docker compose down -v` (**deletes local data**), then `up` again |
| `docker compose logs api` mentions the connection URL | `DB_PASSWORD` contains symbols such as `@`, `:` or `/`. Use letters and digits only |
| `/health/db` → `503 database_not_configured` | `DATABASE_URL` is not set: the API was started outside Compose without `DATABASE_URL`. See [Development without Docker](#development-without-docker) |
| `port is already allocated` on 3000 or 8000 | Another app uses that port. Stop it, or change the left side of `"3000:8080"` (web) or `"8000:8000"` (api) in `compose.yml` locally |
| `localhost:3000` shows the page but every action fails, `/api/...` → `502` | The `api` container is not running. `docker compose ps` and `docker compose logs api` show why |
| Windows + Podman: `localhost:3000` does not answer | A rootful Podman machine is not always reachable via localhost. Use the machine's WSL IP, or run `podman machine set --rootful=false` and restart the machine |
| Live URL takes ~50 s to answer | The free Render instance was asleep. Wait; it stays awake while in use |
| Live `/health/db` fails, local works | Supabase project paused, or `DATABASE_URL` on Render wrong. Resume it in the Supabase dashboard |
| A pull request says "Expected — Waiting for status to be reported" | A required check name in branch protection doesn't match the workflow's job names. Ask the leader to update the required checks |

## Project status

### Follow the progress

| Where | What you see | Updated |
|---|---|---|
| [**Progress dashboard**](https://neitln.github.io/Fair-Share/) | One page: tasks done, milestones and pace, how the work is distributed per member, who reviews whom, tasks by sprint, pipeline and live checks. Every number links to its GitHub records | After every merge and daily |
| [**Project board**](https://github.com/users/NeitLN/projects/2) | Every task `T-01…T-39` as a card: *Todo → In Progress → In Review → Done*. Views: **Board**, **This sprint**, **Roadmap** (W7–W10 timeline), **All tasks**, and one view per member | Live: a linked PR moves a card to *In Review*, a merge moves it to *Done* |
| [**Project status updates**](https://github.com/users/NeitLN/projects/2) (top of the board) | The leader's weekly *On track / At risk* note: what was done, what is next | Every Friday |
| [**Milestones**](https://github.com/NeitLN/Fair-Share/milestones) | % complete and due date of W7, W8, W9, W10 | Live |
| [**Weekly reports**](https://github.com/NeitLN/Fair-Share/issues?q=label%3Aweekly-report) | Generated by [`weekly-report.yml`](.github/workflows/weekly-report.yml): milestone progress, issues closed / PRs merged / reviews / commits **per member**, merged PRs with their reviewers, open P0 tasks, pipeline and live-deploy health | Every Friday 09:00 (UTC+7) |
| [**Pull requests**](https://github.com/NeitLN/Fair-Share/pulls?q=is%3Apr) | Who wrote and who reviewed each change; every PR closes a `T-xx` issue | Live |
| [**Actions**](https://github.com/NeitLN/Fair-Share/actions) | Every check and deploy; the `smoke` job proves which commit is live | Every PR and merge |

Week 6 is complete: container, Compose stack, live HTTPS deployment, and a pipeline that blocks a bad merge
and deploys a good one. Remaining milestones:

| Milestone | Due | Goal |
|---|---|---|
| [W7 · Foundation & cloud database](https://github.com/NeitLN/Fair-Share/milestone/1) | 22 Oct 2026 | Supabase attached; households & members end to end on the live URL |
| [W8 · Features & AI live](https://github.com/NeitLN/Fair-Share/milestone/2) | 28 Oct 2026 | All user stories live, including Quick add and its failure handling; secret audit |
| [W9 · Hardening & freeze](https://github.com/NeitLN/Fair-Share/milestone/3) | 1 Nov 2026 | Peer review fixed, persistence drill, diagrams, report draft; **feature freeze** |
| [W10 · Report & rehearsal](https://github.com/NeitLN/Fair-Share/milestone/4) | 11 Nov 2026 | Report PDF submitted 8 Nov; two rehearsals; assessment on **12 Nov 2026** |

Week-by-week tasks and owners: [docs/ROADMAP.md](docs/ROADMAP.md).

## Assessment checklist

The five live-demo criteria of the brief, and where the evidence is. Updated as each piece lands.

| Criterion (points) | Evidence | Status |
|---|---|---|
| Publicly reachable over HTTPS (6) | [web app](https://fair-share-web.onrender.com) · [API](https://fair-share-4bu9.onrender.com) | ✅ both live over HTTPS |
| Compose brings the full stack up from a clean clone (5) | [Quick start](#quick-start-docker-compose); clean clone done in Week 4 on a teammate's machine that never had the project | ✅ web + api + db (T-11) · 🚧 clean clone on a teammate's machine, final rehearsal T-34 |
| CI pipeline green on pull requests (5) | [Actions history](https://github.com/NeitLN/Fair-Share/actions); a red PR was blocked in Lab 4 | ✅ lint, tests on PostgreSQL, image build |
| Deployment triggered automatically by a merge to `main` (5) | `deploy` job → Render deploy hook; Render auto-deploy off | ✅ verified by the `smoke` job (live commit = merged commit) |
| Configuration and secrets via the environment, none in the repository (4) | [Configuration](#configuration), `.gitignore`, `.env.example` | ✅ policy · ✅ [full-history audit](docs/SECRET_AUDIT.md) and gitleaks in CI |
| Managed cloud PostgreSQL attached by one env var | `DATABASE_URL` on Render → Supabase; live [`/health/db`](https://fair-share-4bu9.onrender.com/health/db) | ✅ |
| AI feature on the live URL, failure handled | Quick add + fallback | 🗓️ Week 8 (T-19, T-21, T-22) |

✅ done · 🚧 in progress or in review · 🗓️ planned

## Team and workflow

| Member | GitHub | Role |
|---|---|---|
| Võ Việt Tiến | [@NeitLN](https://github.com/NeitLN) | Team leader · project manager · platform/DevOps · AI integration |
| Duy Anh | [@anh7032](https://github.com/anh7032) | Frontend lead · QA |
| Hoàng Minh | [@Jayson135724](https://github.com/Jayson135724) | Backend & database lead |

Every change goes through an issue → branch → pull request → review → merge.
Nobody pushes to `main`. Details: [CONTRIBUTING.md](CONTRIBUTING.md) · team record: [TEAM.md](TEAM.md).

---

Academic coursework for Van Lang University (72ITDS30103, Semester 261).
