# Diagrams for the report (T-28)

| Diagram | Source | Exported | Used in |
|---|---|---|---|
| Production architecture | [`architecture.mmd`](architecture.mmd) | `architecture.svg`, `architecture.png` | Report §2, README |
| Local stack (Docker Compose) | [`local.mmd`](local.mmd) | `local.svg`, `local.png` | Report §2 and §3 |
| Database schema (ER) | [`er.mmd`](er.mmd) | `er.svg`, `er.png` | Report §5 |

The `.mmd` files are the source of truth; the SVG (for the web) and PNG (for the PDF, 2× scale) are
generated from them. After changing a diagram, regenerate the exports in the same pull request:

```bash
# from the repository root (Docker or Podman)
for d in architecture local er; do
  docker run --rm -u "$(id -u):$(id -g)" -v "$PWD/docs/diagrams:/data" \
    ghcr.io/mermaid-js/mermaid-cli/mermaid-cli:11.4.2 -i "$d.mmd" -o "$d.svg" -b white
  docker run --rm -u "$(id -u):$(id -g)" -v "$PWD/docs/diagrams:/data" \
    ghcr.io/mermaid-js/mermaid-cli/mermaid-cli:11.4.2 -i "$d.mmd" -o "$d.png" -b white -s 2
done
```

## Checked against what is deployed (22/10/2026)

The architecture diagram must show what really runs, not the plan. Each box and arrow was checked
against the live services or the configuration that creates them:

| In the diagram | How it was checked | Result |
|---|---|---|
| Cloudflare edge in front of both Render services | Response headers of the API and the web app: `Server: cloudflare` and a `CF-RAY` id (ours ended in `-SIN`: the Singapore edge, nearest to Vietnam) | ✅ |
| Render Web Service `fair-share-4bu9` running our Docker image (Uvicorn) | `x-render-origin-server: uvicorn`; `/api/version` → `env: production` and `commit` = the latest merge on `main` | ✅ |
| Render Static Site `fair-share-web`, `/* → index.html` | `GET /` → 200; deep link `/households/1` → 200 (the rewrite rule works) | ✅ |
| CORS: only the web origin | Preflight from `https://fair-share-web.onrender.com` → `access-control-allow-origin` set; from another origin → 400, no header | ✅ |
| Supabase PostgreSQL over TLS, session pooler, one `DATABASE_URL` | `/health/db` runs one query through it (`{"db":"ok","schema":"001_init"}` in the daily keep-alive and the post-deploy smoke run); pooler + `sslmode=require` per the Render setting (T-05) | ✅ (see note) |
| RLS on every table | `001_init.sql` enables it on all five tables | ✅ |
| Gemini `gemini-3.5-flash-lite`, key only on the API | `GEMINI_MODEL` default in `app/config.py`; the key is a Render env var, never in the repo (gitleaks job) | ✅ |
| Deploy hooks pinned to the tested commit; smoke, E2E and keep-alive after deploy | `.github/workflows/ci-cd.yml`, `e2e.yml`, `keep-alive.yml`; their runs on 22/10 were green | ✅ |

**Note:** at 07:10 UTC on 22/10 the live `/health/db` answered `503 database_unavailable`, after the
keep-alive had passed at 05:39 UTC. The diagram is unchanged by that (the API still connects to
Supabase the same way), but it is the kind of outage the persistence drill (T-27) and the demo-day
runbook (T-38) prepare for.
