# Fair-Share
A three-tier web app for housemates to track shared expenses, split costs, and reconcile balances, with AI-assisted expense entry. Final project for Software Development Platforms (72ITDS30103), Van Lang University.

## Stack

- **web** — FastAPI app (`app/main.py`), built from `./Dockerfile`, listens on port 8000.
- **db** — PostgreSQL 16 (`postgres:16-alpine`), seeded on first start by `db/init.sql`.
- Data lives in the named volume `pgdata`, so it survives `podman compose down` and `up`.
- Configuration comes from `.env`, which is **never committed**. `.env.example` lists the variable names.

## Run locally

Requirements: Podman 4 or later with a compose provider (or Docker Desktop).

1. `git clone https://github.com/NeitLN/Fair-Share.git`
2. `cd Fair-Share`
3. `cp .env.example .env` — **then open `.env` and set `DB_PASSWORD`** to a password of letters and digits only. Characters such as `@ : / #` break the connection URL, and Compose will not start the stack until this value is set.
4. `podman compose up --build`
5. Open http://localhost:3000 — database check: http://localhost:3000/health/db

Stop the stack: `podman compose down`

Reset the database (data lost): `podman compose down -v`

## API

- `GET /` — app name and version
- `GET /health` — liveness probe
- `GET /health/db` — proves the app can reach PostgreSQL: `{"db": "ok", "notes": <count>}`
- `GET /items`, `GET /items/{id}` — sample in-memory data

## Development

```sh
python -m pip install -r requirements-dev.txt
python -m pytest
```

Tests that need a live database are skipped unless `RUN_DB_TESTS=1`.
