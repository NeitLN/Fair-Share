# Clean-clone rehearsal (T-34)

The assessment's first check is that a machine which has never seen Fair-Share goes from `git clone` to
a running stack with **one command**. This page is the script for that rehearsal: the exact steps, what
to time, what "passed" means, and the record of each run. The README's
[Quick start](../README.md#quick-start-docker-compose) is the user-facing version of the same steps.

Owner: Duy Anh · Reviewer: Việt Tiến · Runs: dry run 22/10, **#1 Tue 03/11**, **final Mon 09/11**.

## 1. Before you start

| Check | How | Why |
|---|---|---|
| The machine never had the project | No `Fair-Share` folder, no `fair-share_pgdata` volume (`docker volume ls`), no `fair-share-*` image (`docker images`) | Otherwise the run reuses old data or layers and proves nothing |
| Docker is running | `docker info` answers (Docker Desktop is not *paused*), or `podman machine list` says *Currently running* | `compose up` fails at once otherwise |
| Ports 3000 and 8000 are free | Windows: `netstat -ano \| findstr ":3000 :8000"` prints nothing · macOS/Linux: `lsof -i :3000 -i :8000` | `port is already allocated` stops the stack ([Troubleshooting](../README.md#troubleshooting)) |
| Git is installed | `git --version` | The only tool needed besides Docker |
| A stopwatch | phone | Every run records the timings below |

Nothing else is installed: no Node, Python or PostgreSQL on the machine, and **no `.env`**.

## 2. The steps

```bash
git clone https://github.com/NeitLN/Fair-Share.git      # start the stopwatch
cd Fair-Share
docker compose up --build                                # one command; leave it running
```

Stop the stopwatch when the **web app reaches the API**: http://localhost:3000/api/version answers
`{"app":"fair-share",…}`. Compose starts `db`, then `api` once the database is healthy, then `web` once
the API is healthy, so this is the moment the whole stack works.

Then, in a second terminal or the browser:

| # | Check | Expected |
|---|---|---|
| 1 | http://localhost:3000 | The Fair-Share page |
| 2 | http://localhost:3000/api/version | `{"app":"fair-share","version":…}` (web → nginx → api) |
| 3 | http://localhost:8000/health | `{"status":"ok"}` |
| 4 | http://localhost:8000/health/db | `{"db":"ok","schema":"001_init"}` |
| 5 | http://localhost:8000/docs | Swagger UI |
| 6 | Open **Nhà trọ demo** | Three members, five expenses over two months, a verdict on Tổng quan |
| 7 | Reload on a deep link, e.g. http://localhost:3000/households/1/expenses | The page, not a 404 |
| 8 | `docker compose down`, then `docker compose up -d --wait` (time it) | Comes back in seconds; anything you added is still there |
| 9 | `docker compose down -v` | Removes the local database; the next `up` starts from the demo household again |

Optional, with Node 22 on the machine (`cd frontend && npm ci && npx playwright install chromium`):
`E2E_BASE_URL=http://localhost:3000 E2E_API_URL=http://localhost:3000 npm run e2e` runs the main flow and
the accessibility checks in a real browser against this stack.

**Passed** = checks 1–7 answer as expected with only the three commands above and no file edited.
Any extra step a newcomer needed (a setting, a restart, a workaround) is a README fix, filed as an issue
before the next run.

## 3. Afterwards

```bash
docker compose down -v --rmi local    # stack, its volume and the two images it built
```

Base images (`python:3.12-slim`, `node:22-alpine`, `nginxinc/nginx-unprivileged:1.29-alpine`,
`postgres:16-alpine`) stay cached; delete them too if the same machine is used for the next rehearsal.

## 4. Timings

| Situation | Measured | Where it matters |
|---|---|---|
| Nothing cached: the four base images are downloaded, both images built | **358 s** from `git clone` to `/api/version` answering (22/10, home connection) | The worst case on a fresh machine |
| Base images already pulled, nothing of ours cached | **30 s** from `git clone` to the stack up, with `pip install` and `npm ci` run again (24/10, `docker compose build --no-cache` then `up -d --wait`); pulling the four base images first took 14 s | Demo day: base images are pulled beforehand without touching the repository |
| Restart (`down` then `up -d --wait`) | **13 s** (22/10) | Later starts |

**Demo day.** The live demo block is 4 minutes, and a build from nothing took 6. Before the session,
on the demo laptop, pull the base images (`docker pull` each of the four above) and check the ports;
then the clean clone itself (`git clone` → `docker compose up --build`) runs live from an empty folder in
about half a minute. Say so in the talk: what is cached are public base images, not our code.

## 5. Record of runs

| Run | Date | Machine | Docker | Result | Clone → `/api/version` | Notes |
|---|---|---|---|---|---|---|
| Dry run | 22/10 | Duy Anh's laptop, Windows 11 (had the project in another folder; no Fair-Share volume or image) | Docker Desktop 29.9, Compose v5.6 | ✅ passed checks 1–9, Playwright 2/2 | 358 s, nothing cached | README needed no change. Found: the demo household had no expenses, fixed in #124 / #125. Details in [#53](https://github.com/NeitLN/Fair-Share/issues/53) |
| Demo timing | 24/10 | Same laptop, base images pulled first, our build cache bypassed | Docker Desktop 29.9 | ✅ `/api/version` 200, `/health/db` ok, demo household with 5 expenses | 30 s | Measures the demo-day plan above; not a fresh-machine run |
| #1 | Tue 03/11 | *a machine that never had the project* | | | | |
| Final | Mon 09/11 | | | | | |
