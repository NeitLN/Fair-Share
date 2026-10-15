# Fair-Share

[![CI/CD](https://github.com/NeitLN/Fair-Share/actions/workflows/ci-cd.yml/badge.svg?branch=main)](https://github.com/NeitLN/Fair-Share/actions/workflows/ci-cd.yml)

A three-tier web app for housemates to track shared expenses, split costs, and reconcile balances, with
AI-assisted expense entry: type *"dinner 240k, Minh paid, split 3 ways"* and get a pre-filled form.
Final project for Software Development Platforms (72ITDS30103), Van Lang University.

**Live:** https://fair-share-4bu9.onrender.com (API — the web app URL is added in Week 8)

| | |
|---|---|
| What we build and why | [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md) |
| How it is built and deployed | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Plan, milestones, who does what | [docs/ROADMAP.md](docs/ROADMAP.md) · [project board](https://github.com/NeitLN/Fair-Share/projects) |
| How we work | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Team | [TEAM.md](TEAM.md) |

## Run locally

Requirements: Docker Desktop (or Podman 4+ with a compose provider).

1. `git clone https://github.com/NeitLN/Fair-Share.git`
2. `cd Fair-Share`
3. `cp .env.example .env` — then set `DB_PASSWORD` (letters and digits only)
4. `docker compose up --build`
5. Open http://localhost:3000 — database check: http://localhost:3000/health/db

Stop: `docker compose down` · Reset the database (data lost): `docker compose down -v`
