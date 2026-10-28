# 3. Dockerfile and Compose explained

*Owner: Duy Anh. Sources: [`Dockerfile`](../../Dockerfile), [`frontend/Dockerfile`](../../frontend/Dockerfile),
[`frontend/nginx.conf`](../../frontend/nginx.conf), [`compose.yml`](../../compose.yml); measured on 21/10/2026
with Podman 5 on Windows.*

There are two images. The **API image** (root `Dockerfile`) is the one Render runs and the one Compose runs
locally. The **web image** (`frontend/Dockerfile`) is used only by Compose; in production the SPA is a
Render Static Site. PostgreSQL comes from the official `postgres:16-alpine`. One command,
`docker compose up --build`, starts all three from a clean clone, with no `.env`.

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
| `python:3.12-slim` | The same Python as CI, so "passed in CI" means the same interpreter in production; *slim* has no compilers. Image: **162 MB** |
| `ENV PYTHON…` | No `.pyc` files, logs straight to stdout (Render shows them at once), no pip cache |
| `useradd` before any `COPY` | It never changes, so the layer is always reused |
| `requirements.txt` installed **before** the code | A changed layer rebuilds everything after it. Dependencies change rarely, code on every commit: in this order a code change reuses the installed packages |
| `COPY app/ db/` only | `.dockerignore` keeps `.git`, `.env`, tests, docs and `frontend/` out of the context, so no secret can reach the image |
| `USER appuser` | The server never runs as root (`id` in the container: `uid=10001`) |
| `$PORT` and `exec` | Render picks the port at run time; `exec` makes Uvicorn PID 1, so the stop signal reaches it and it shuts down cleanly |

## 3.2 The web image: two stages

```dockerfile
FROM node:22-alpine AS build                  # stage 1: compile
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build                             # type check + Vite → dist/

FROM nginxinc/nginx-unprivileged:1.29-alpine  # stage 2: serve
ENV API_UPSTREAM=http://api:8000 NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
```

- **Two stages:** Node, `node_modules` and the sources are needed to build, not to serve. The build stage
  is **408 MB**, the final image **55.8 MB** (86 % smaller).
- **Layer order:** the lockfile and `npm ci` come before `COPY . .`; after editing one source file the
  rebuild reused the `npm ci` layer.
- **`VITE_API_BASE_URL`** is baked into the JavaScript, so it is public, never a secret; empty means "same
  origin".
- **Non-root nginx** (uid 101) cannot bind ports below 1024, so it listens on **8080**.
- **nginx rules:**
  - `try_files $uri /index.html` lets React Router own the URLs, so reloading a deep link works.
  - `/api/` is proxied to the `api` container, so the browser sees one origin and needs no CORS locally.
  - `api` is resolved per request, so nginx starts even before the API is up.
  - Hashed assets are cached for a year, `index.html` never.

## 3.3 The Compose stack

```
browser ──► web :3000 (nginx 8080) ──/api──► api :8000 (FastAPI) ──► db (PostgreSQL, no published port)
```

| Service | Built from | Ports | Starts when |
|---|---|---|---|
| `db` | `postgres:16-alpine` | none: only `api` reaches it on the private network | first |
| `api` | `.` | `8000` (for `/docs` while developing) | `db` is **healthy** (`pg_isready`) |
| `web` | `./frontend` | `3000:8080` | `api` is **healthy** (`/health`) |

- **Start order by health, not by start:** `condition: service_healthy` stops the first page load from
  hitting a 502 from an API that is still starting.
- **Data survives restarts:** PostgreSQL keeps its files in the named volume `pgdata`; `down` keeps it, only
  `down -v` deletes it.
- **Schema and demo data come from the API:** its own migrations create the schema at start-up
  (section 5), and `SEED_DEMO_DATA` fills an empty local database only.
- **No `.env` needed:** `DATABASE_URL` is built from `DB_PASSWORD`, which has a throw-away local default.
  A git-ignored `.env` can override it, or add a `GEMINI_API_KEY` to try Quick add.

**How we know it works.** Every pull request starts both images and the whole stack in CI (the `images`
job, section 4). A clean clone on a machine without the project took **358 s** with nothing cached and
**30 s** with the base images pulled ([CLEAN_CLONE.md](../CLEAN_CLONE.md), T-34).

| Problem we met | Fix |
|---|---|
| On Podman, nginx could not find `api` by name and would not start before it was up | Resolve per request with the resolver from `/etc/resolv.conf` (Docker and Podman) |
| A clean clone failed without `.env` (empty PostgreSQL password) | A default local password in `compose.yml` |
