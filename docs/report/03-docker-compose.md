# 3. Dockerfile and Compose explained

*Draft for report section 3 (owner: Duy Anh). Sources: [`Dockerfile`](../../Dockerfile),
[`frontend/Dockerfile`](../../frontend/Dockerfile), [`frontend/nginx.conf`](../../frontend/nginx.conf),
[`compose.yml`](../../compose.yml), [ARCHITECTURE.md §2](../ARCHITECTURE.md#2-local-topology-docker-compose--and-why-it-differs).
Measurements taken on 21/10/2026 with Podman 5 on Windows.*

Fair-Share is built into two images. The **API image** (root `Dockerfile`) is the one Render runs in
production and the one Compose runs locally. The **web image** (`frontend/Dockerfile`) is used only by
Compose: in production the React app is a Render Static Site, which runs `npm run build` itself. A third
container, PostgreSQL, comes from the official `postgres:16-alpine` image. One command,
`docker compose up --build`, starts all three from a clean clone.

## 3.1 The API image

```dockerfile
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN useradd --create-home --uid 10001 appuser
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app/ app/
COPY db/ db/
USER appuser
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

| Instruction | Why it is there, and why in this place |
|---|---|
| `python:3.12-slim` | The same Python minor version as CI and the linter, so "it passed in CI" means the same interpreter in production. *Slim* has no compilers or docs; the image is **162 MB** |
| `ENV PYTHON…` | No `.pyc` files written into the image, logs go straight to stdout (Render and `docker logs` show them at once), no pip cache left behind |
| `useradd` before any `COPY` | Creating the user never changes, so this layer is always reused from the cache |
| `requirements.txt` copied and installed **before** the code | Docker rebuilds a layer and everything after it when its input changes. Dependencies change rarely, code changes on every commit: in this order a code change re-uses the installed packages instead of reinstalling them |
| `COPY app/ db/` only | `.dockerignore` keeps `.git`, `.env`, tests, docs and `frontend/` out of the build context, so no secret or unused file can end up in the image |
| `USER appuser` | The server never runs as root: a bug in the app cannot write to the system. Checked: `id` in the container prints `uid=10001(appuser)` |
| `PORT` and `sh -c "exec …"` | Render chooses the port at run time through `$PORT`; locally it defaults to 8000. `exec` replaces the shell with Uvicorn, so the stop signal reaches the server and it shuts down cleanly |

## 3.2 The web image: two stages

```dockerfile
FROM node:22-alpine AS build          # stage 1: compile
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build                     # TypeScript check + Vite → dist/

FROM nginxinc/nginx-unprivileged:1.29-alpine   # stage 2: serve
ENV API_UPSTREAM=http://api:8000 NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
```

* **Why two stages.** Node, `node_modules` and the source code are needed to *build* the app, not to
  *serve* it. The first stage is thrown away; the final image holds only nginx and the built files.
  Measured: the build stage is **408 MB**, the final web image **55.8 MB**, 86 % smaller.
* **Layer order again.** `package.json` and the lockfile are copied and `npm ci` runs before `COPY . .`.
  Measured: after editing one source file, the rebuild printed *Using cache* for `npm ci` and only re-ran
  the copy and the build.
* **`VITE_API_BASE_URL`** is baked into the JavaScript at build time, so it is public and never a secret.
  Empty means "same origin": in Compose the browser calls `/api` on the web container itself.
* **Non-root nginx.** The unprivileged image runs nginx as uid 101 (checked with `id`). A non-root
  process cannot open ports below 1024, so nginx listens on **8080** instead of 80.

## 3.3 What nginx does

| Rule | Purpose |
|---|---|
| `try_files $uri /index.html` | React Router owns the URLs: reloading `/households/7/expenses` has no file on disk, so nginx answers with the app, which then shows the right page |
| `location /api/` → `proxy_pass $api_upstream` | The browser talks to one origin (`localhost:3000`) and nginx forwards API calls to the `api` container. No CORS is needed locally. `X-Forwarded-For` carries the visitor's address, which the AI rate limit uses |
| `resolver` + a variable in `proxy_pass` | nginx looks `api` up per request through the container's DNS (Docker or Podman). It therefore starts even if `api` is not up yet, and a request in that moment gets a clear 502 instead of nginx refusing to start |
| `/assets/` cached a year, `index.html` `no-cache` | Vite puts a content hash in every asset name, so assets can be cached forever; `index.html` is always revalidated, so a new build shows on the next load |

## 3.4 The Compose stack

```
browser ──► web :3000 (nginx 8080) ──/api──► api :8000 (FastAPI) ──► db (PostgreSQL, no published port)
```

| Service | Built from | Ports | Starts when |
|---|---|---|---|
| `db` | `postgres:16-alpine` | none: only `api` reaches it, on Compose's private network | first |
| `api` | `.` (the API image) | `8000:8000`, for `/docs` and `/health/db` while developing | `db` is **healthy** (`pg_isready`) |
| `web` | `./frontend` | `3000:8080`, the app | `api` is **healthy** (its `/health` answers) |

* **Start order by health, not by start.** `depends_on` with `condition: service_healthy` waits until
  PostgreSQL accepts connections and until the API answers `/health`. Without the API health check the
  first page load after `up` could hit a 502 from an API that was still starting. The API image has no
  `curl`, so the check is a one-line Python request; `/health` never touches the database, so a database
  problem does not mark the API itself as unhealthy.
* **Data survives restarts.** PostgreSQL stores its files in the named volume `pgdata`. `docker compose
  down` keeps it; only `down -v` deletes it. The schema is created by the API's own migrations at start-up
  (section 5), and `SEED_DEMO_DATA` adds a demo household to an empty local database only.
* **Configuration from the environment.** `DATABASE_URL` is assembled from `DB_PASSWORD`, which defaults to
  a throw-away local value, so a clean clone needs no `.env` at all. A `.env` file (git-ignored) can
  override it or add a `GEMINI_API_KEY` to try AI Quick add locally; without a key the feature says it is
  not available and the manual form works.

## 3.5 Local versus cloud

| Concern | Compose (local) | Production (Render + Supabase) |
|---|---|---|
| API | the same image | the same image, built by Render from the same `Dockerfile` |
| Web app | nginx container, same origin, no CORS | Render Static Site on its own domain; the API allows only that origin (CORS) |
| Database | `db` container + `pgdata` volume | Supabase PostgreSQL through `DATABASE_URL`, over TLS |
| Secrets | none needed; optional `.env` | Render environment variables only |

The API image is identical in both places, which is the point: what runs on a laptop is what runs in
production.

## 3.6 How we know it works

* **Every pull request** runs the `images` job in GitHub Actions: it builds both images, starts each one and
  checks it answers (`/health` for the API; `/` and a deep link for the web), then runs
  `docker compose up --build --wait` exactly as a clean clone would, with no `.env`, and checks that the
  web app reaches the API through nginx (`/api/version`) and the API reaches PostgreSQL (`/health/db`).
  A change that breaks a Dockerfile or `compose.yml` cannot be merged.
* **On a teammate's machine** the stack was started from a fresh clone during review of the Compose PR
  (#73); the final rehearsal on a machine that never had the project is task T-34.

## 3.7 Problems we met and how we fixed them

| Problem | Fix |
|---|---|
| On Podman, nginx could not find the `api` container by name, and failed to start when `api` was not up yet | Resolve the name per request through the resolver read from `/etc/resolv.conf` (works on Docker and Podman) |
| Running nginx as non-root made port 80 unavailable | Listen on 8080 inside the container, publish it as 3000 |
| The first page load right after `up` sometimes got a 502 | Health check on the API and `condition: service_healthy` for `web` |
| A clean clone failed without a `.env` file (PostgreSQL refuses an empty password) | A default local password in `compose.yml`; `.env` only overrides it |
| Reloading a page such as `/households/7` returned 404 | `try_files … /index.html` so the app handles its own routes |
