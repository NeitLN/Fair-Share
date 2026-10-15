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
> on Render, and a GitHub Actions pipeline that blocks a bad merge and deploys a good one. The running app
> is still the course's FastAPI starter. The expense features, the React app, Supabase and the AI feature
> arrive in Weeks 7–8 ([project status](#project-status)).

Final project for **72ITDS30103 Software Development Platforms**, Van Lang University, Semester 261.
What is assessed is the platform pipeline around the application: container, Compose stack, CI/CD,
managed database and a server-side AI call ([assessment checklist](#assessment-checklist)).

| | |
|---|---|
| 🌐 **Live API** | https://fair-share-4bu9.onrender.com · interactive docs at [`/docs`](https://fair-share-4bu9.onrender.com/docs) |
| 🖥️ **Web app** | Render Static Site, URL added here in Week 7–8 (T-14) |
| 📋 **Project board** | [Fair-Share Roadmap](https://github.com/users/NeitLN/projects/2) · [milestones](https://github.com/NeitLN/Fair-Share/milestones) |
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

Target architecture for Session 20. Live today: the API on Render and the pipeline. Supabase and the
static site arrive in Week 7, Gemini in Week 8.

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
| Application | Python 3.12 (CI; the image moves from 3.14 to 3.12 in [#60](https://github.com/NeitLN/Fair-Share/pull/60)), FastAPI, Uvicorn, psycopg 3 | Docker container on a Render Web Service |
| Data | PostgreSQL 16 | Supabase (cloud) · `postgres:16-alpine` (local) |
| AI | Google Gemini API, structured JSON output | Called from the API only |
| CI/CD | GitHub Actions → Render deploy hooks | GitHub-hosted runners |
| Quality | ruff, pytest, ESLint, Vitest | Locally and in CI |

Every platform is on a free tier that needs **no credit card**. Fallbacks are declared in
[ARCHITECTURE.md §7](docs/ARCHITECTURE.md#7-platform-selection-and-declared-fallbacks-zero-credit-card).

## Quick start (Docker Compose)

**Requirements:** Git and Docker Desktop, or Podman 4+ with a compose provider. Nothing else: Python and
PostgreSQL run inside containers.

```bash
git clone https://github.com/NeitLN/Fair-Share.git
cd Fair-Share
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
```

Open `.env` and set `DB_PASSWORD` to any value made of **letters and digits only** (it is placed inside a
URL, where symbols such as `@` or `:` would break it). Then:

```bash
docker compose up --build
```

| Check | URL | Expected |
|---|---|---|
| API is alive | http://localhost:3000/health | `{"status":"ok"}` |
| API reaches PostgreSQL | http://localhost:3000/health/db | `{"db":"ok","notes":1}` |
| Interactive API docs | http://localhost:3000/docs | Swagger UI |

```bash
docker compose down        # stop, keep the data
docker compose down -v     # stop AND permanently delete the local database volume (fresh start)
```

The first start creates the schema from [`db/init.sql`](db/init.sql). That file runs only when the
`pgdata` volume is empty, so after changing it run `docker compose down -v` once.

## Configuration

All configuration comes from **environment variables**; nothing environment-specific is hard-coded.
[`.env.example`](.env.example) is the template. Copy it to `.env`, which is git-ignored. Compose reads
`.env` to fill `${DB_PASSWORD}` in [`compose.yml`](compose.yml).

**Read by the code today**

| Variable | Read by | Local (Compose) | Production (Render) | Secret? |
|---|---|---|---|---|
| `DB_PASSWORD` | `compose.yml` (`db` service and the URL below) | `.env` | — | yes |
| `DATABASE_URL` | `app/main.py` | built in `compose.yml` from `DB_PASSWORD` | service env var (Supabase session pooler, `sslmode=require`, from Week 7) | **yes** |
| `APP_NAME` | `app/main.py` (default `sdp-starter`) | not forwarded by Compose, so the default is used | service env var | no |
| `APP_ENV` | `app/main.py` (default `development`) | not forwarded, default | `production` | no |
| `PORT` | the container's start command (default `8000`) | default | set by Render | no |

**Added with upcoming features**

| Variable | For | Where it will live | Secret? |
|---|---|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | AI Quick add (Week 8) | Render env var; optional local `.env` (without it Quick add says "not configured") | key: **yes** |
| `ALLOWED_ORIGINS` | CORS for the SPA's origin (Week 7–8) | Render env var | no |
| `VITE_API_BASE_URL` | SPA build (Week 7–8) | Render static site env var | no, public |
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
PostgreSQL with a published port and set `DATABASE_URL` in your shell:

```bash
docker run -d --name fs-dev-db -p 5432:5432 \
  -e POSTGRES_USER=app -e POSTGRES_PASSWORD=devonly -e POSTGRES_DB=appdb \
  -v "$PWD/db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro" postgres:16-alpine
export DATABASE_URL=postgresql://app:devonly@localhost:5432/appdb
# PowerShell: $env:DATABASE_URL = "postgresql://app:devonly@localhost:5432/appdb"
```

(The Compose `db` service does not publish a port, on purpose: only the API container talks to it.)

## API

FastAPI publishes an always-current reference at **`/docs`** (Swagger UI) and **`/openapi.json`**.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness for Render and the pipeline; never touches the database |
| `GET` | `/health/db` | Readiness: runs one query against PostgreSQL; `503` if it cannot |
| `GET` | `/` | Name, version and environment of the running app |
| `GET` | `/items`, `/items/{id}` | Starter sample data; removed when the real API lands (T-06) |
| `GET` | `/api/version` | Name, version, environment and the **commit** Render built; used by the post-deploy smoke test (in review, [#62](https://github.com/NeitLN/Fair-Share/pull/62)) |

Planned endpoints, all under `/api`: households, members, expenses, settlements, balances and
`POST /api/households/{id}/ai/parse-expense`, which returns a draft and never saves it. Request/response
shapes and error codes are in [ARCHITECTURE.md §5](docs/ARCHITECTURE.md#5-api-json-prefix-api).

## Testing and quality

| Tool | Command | Covers | Status |
|---|---|---|---|
| ruff | `ruff check .` | Python style, unused imports, likely bugs, import order | in CI |
| pytest | `pytest -q` | Starter HTTP endpoints | in CI |
| pytest + PostgreSQL | `pytest -q` with `DATABASE_URL` set | `/health/db` against a real database; skipped locally without one, never skipped in CI | in review, [#61](https://github.com/NeitLN/Fair-Share/pull/61) |
| Docker | `docker build .` then run and call `/health` | The image Render will run builds **and** starts | in review, [#61](https://github.com/NeitLN/Fair-Share/pull/61) |
| ESLint / Vitest | `npm run lint` · `npm test` in `frontend/` | SPA type checks and component tests | with `frontend/` (T-09) |

A pull request is merged only when these pass in CI **and** another team member has approved it.

## CI/CD pipeline

Defined in [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml).

```mermaid
flowchart LR
    PR["Pull request"] --> C["check<br/>ruff + pytest"]
    C --> R{"green<br/>+ 1 approval?"}
    R -- "merge to main" --> C2["check again"]
    C2 --> D["deploy<br/>Render deploy hook"]
```

**Today on `main`:**

* **On every pull request:** the `check` job runs `ruff check .` and `pytest -q`. Branch protection on
  `main` requires it to pass plus one approving review, for administrators too, so a red check blocks the
  merge. This was demonstrated in Lab 4 with a deliberately failing test.
* **On every merge to `main`:** `check` runs again; only if it passes does the `deploy` job call the
  Render deploy hook (stored as a GitHub Actions secret). Render's auto-deploy is off, so only a green
  pipeline deploys.

**In review:**

| PR | Adds |
|---|---|
| [#61](https://github.com/NeitLN/Fair-Share/pull/61) (T-13) | Three jobs instead of `check`: `backend` (ruff + pytest against a PostgreSQL service container), `frontend` (lint, test, build once `frontend/` exists), `images` (build the API image and check the container answers `/health`) |
| [#62](https://github.com/NeitLN/Fair-Share/pull/62) (T-23, T-24) | Deploy both Render services, then a `smoke` job that waits until the live `/api/version` reports the merged commit, red after 10 minutes |

## Deployment

| Piece | Platform | How it gets there |
|---|---|---|
| API | Render Web Service, Docker, free instance | GitHub Actions calls the deploy hook; Render builds the root [`Dockerfile`](Dockerfile) |
| Web app | Render Static Site (Week 7–8, T-14) | Same pipeline, second deploy hook |
| Database | Supabase PostgreSQL (Week 7, T-05) | Created once; attached to the API with a single `DATABASE_URL` env var |

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

**How we check it:** a full-history secret scan (gitleaks) as a CI job, plus GitHub secret scanning and
push protection, in Week 9 (T-29). The results will be recorded here.

Found a security problem? Open an issue **without** the secret in it, or tell the team leader directly.

## Repository layout

```
Fair-Share/
├── app/                  # FastAPI application (API image)
│   └── main.py
├── db/
│   └── init.sql          # schema + seed for the local database
├── tests/                # pytest
├── docs/                 # specification, architecture, roadmap
├── .github/
│   ├── workflows/ci-cd.yml
│   ├── ISSUE_TEMPLATE/
│   └── pull_request_template.md
├── Dockerfile            # API image (the one Render builds)
├── compose.yml           # local stack: api + PostgreSQL
├── requirements.txt      # runtime dependencies
├── requirements-dev.txt  # + pytest, ruff
├── pyproject.toml        # ruff and pytest configuration
└── .env.example          # local configuration template
```

`frontend/` (React SPA) and `db/migrations/` are added in Week 7; see the target layout in
[ARCHITECTURE.md §3](docs/ARCHITECTURE.md#3-repository-layout-target).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `/health/db` → `503` mentioning password authentication | Usually `DB_PASSWORD` changed after the volume was created; PostgreSQL keeps the first password. For a disposable local database: `docker compose down -v` (**deletes local data**), then `up` again |
| `/health/db` → `503` mentioning the connection URL | `DB_PASSWORD` contains symbols such as `@`, `:` or `/`. Use letters and digits only |
| `/health/db` → `503 DATABASE_URL is not set` | The API was started outside Compose without `DATABASE_URL`. See [Development without Docker](#development-without-docker) |
| `port is already allocated` on 3000 | Another app uses port 3000. Stop it, or change the left side of `"3000:8000"` in `compose.yml` locally |
| Windows + Podman: `localhost:3000` does not answer | A rootful Podman machine is not always reachable via localhost. Use the machine's WSL IP, or run `podman machine set --rootful=false` and restart the machine |
| Live URL takes ~50 s to answer | The free Render instance was asleep. Wait; it stays awake while in use |
| Live `/health/db` fails, local works | Supabase project paused, or `DATABASE_URL` on Render wrong. Resume it in the Supabase dashboard |
| A pull request says "Expected — Waiting for status to be reported" | A required check name in branch protection doesn't match the workflow's job names. Ask the leader to update the required checks |

## Project status

Week 6 is complete: container, Compose stack, live HTTPS deployment, and a pipeline that blocks a bad merge
and deploys a good one. Remaining milestones:

| Milestone | Due | Goal |
|---|---|---|
| [W7 · Foundation & cloud database](https://github.com/NeitLN/Fair-Share/milestone/1) | 22 Oct 2026 | Supabase attached; households & members end to end on the live URL |
| [W8 · Features & AI live](https://github.com/NeitLN/Fair-Share/milestone/2) | 29 Oct 2026 | All user stories live, including Quick add and its failure handling |
| [W9 · Hardening, audit & report draft](https://github.com/NeitLN/Fair-Share/milestone/3) | 5 Nov 2026 | Secret audit, persistence drill, report draft |
| [W10 · Demo ready](https://github.com/NeitLN/Fair-Share/milestone/4) | 11 Nov 2026 | Rehearsed demo; assessment on **12 Nov 2026** |

Week-by-week tasks and owners: [docs/ROADMAP.md](docs/ROADMAP.md).

## Assessment checklist

The five live-demo criteria of the brief, and where the evidence is. Updated as each piece lands.

| Criterion (points) | Evidence | Status |
|---|---|---|
| Publicly reachable over HTTPS (6) | https://fair-share-4bu9.onrender.com; web app URL from T-14 | ✅ API live · 🚧 web app |
| Compose brings the full stack up from a clean clone (5) | [Quick start](#quick-start-docker-compose); clean clone done in Week 4 on a teammate's machine that never had the project | ✅ api + db · 🚧 + web (T-11), final rehearsal T-34 |
| CI pipeline green on pull requests (5) | [Actions history](https://github.com/NeitLN/Fair-Share/actions); a red PR was blocked in Lab 4 | ✅ · 🚧 build + DB jobs (#61) |
| Deployment triggered automatically by a merge to `main` (5) | `deploy` job → Render deploy hook; Render auto-deploy off | ✅ · 🚧 commit-verified smoke test (#62) |
| Configuration and secrets via the environment, none in the repository (4) | [Configuration](#configuration), `.gitignore`, `.env.example` | ✅ policy · 🚧 full-history audit (T-29) |
| Managed cloud PostgreSQL attached by one env var | `DATABASE_URL` on Render → Supabase | 🚧 Week 7 (T-05) |
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
