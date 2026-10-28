# 1. Platform selection rationale

*Draft for report section 1 (owner: Việt Tiến). Sources: [ARCHITECTURE.md §7](../ARCHITECTURE.md#7-platform-selection-and-declared-fallbacks-zero-credit-card),
[PROJECT_SPEC.md](../PROJECT_SPEC.md), [OUTAGES.md](../OUTAGES.md). Facts checked on the live services in
October 2026.*

Fair-Share has five platform needs: run a Docker API, serve a React SPA, keep data in managed PostgreSQL,
call an AI model from the server, and build, test and deploy on every merge. Three constraints decided
every choice:

1. **No credit card.** None of us could attach one, so every service had to be usable with a free plan
   and no payment details at all.
2. **A Docker image, not a framework preset.** The brief assesses the container, so the API host had to
   run *our* image, the same one Compose runs locally.
3. **One way to deploy.** Everything is deployed by the pipeline after a reviewed merge; no service may
   deploy itself from a push.

## 1.1 What we chose and what we compared

| Need | Chosen | Compared with | Why the choice won |
|---|---|---|---|
| API hosting | **Render Web Service** (Docker) | Railway, Fly.io, Vercel | Runs any Dockerfile on a free plan without a card; a **deploy hook** lets CI decide when to deploy, so auto-deploy stays off. Railway and Fly.io ask for a card; Vercel is built for serverless functions, not a long-running container |
| SPA hosting | **Render Static Site** | GitHub Pages, Netlify | Same dashboard and the same deploy-hook model as the API, a CDN that never sleeps, and a rewrite rule so deep links like `/households/1` work |
| Database | **Supabase** PostgreSQL | Neon, Render PostgreSQL | Plain PostgreSQL reached by one `DATABASE_URL`, so the code is the same as locally. Render's free database is deleted after 30 days, too short for our timeline |
| AI | **Google Gemini** (`gemini-3.5-flash-lite`) | Groq, OpenRouter, Hugging Face | A free API key without a card, structured JSON output (the model answers in our schema), and everyday Vietnamese such as "240k"; matching names without accents is done by our own code |
| CI/CD | **GitHub Actions** | GitLab CI, Jenkins | The code and the reviews already live on GitHub; free minutes for a public repository; branch protection uses the jobs' results directly |

## 1.2 What the free plans cost us, and how we handle it

Choosing free plans means accepting their limits. We wrote each one down before building, with a way to
live with it:

| Limit | Effect | What we did |
|---|---|---|
| The Render API **sleeps after ~15 minutes** without traffic | The first request after that takes about 50 s | The README says so; the page shows a loading state; before a demo we wake the service first (runbook, T-38) |
| A Supabase free project **pauses after 7 days** without activity | The API answers `503` until it is resumed from the dashboard | A daily scheduled workflow runs a real query (T-26); `/health` never touches the database, so a paused database does not make Render restart the API |
| Supabase's direct host is **IPv6 only**, Render has no IPv6 egress | A direct connection fails | We connect through Supabase's **session pooler** (IPv4, TLS) |
| Gemini's free quota is **per minute and per day** | Too many calls get `429` | Our own limits sit below it: 5 per minute per visitor and a global 10 per minute, 200 per day; every failure leaves the manual form usable |
| No support contract on any free plan | Outages are ours to notice and explain | Our own backups and a restore drill (T-27); on 22–23/10 the database was unreachable for about half an hour twice, and the API stayed up and answered a clean `503` ([OUTAGES.md](../OUTAGES.md)) |

## 1.3 Declared fallbacks

Each choice has a named replacement, so a provider change is a configuration change rather than a
redesign. That the replacement still needs no card has to be checked again before switching, since
free plans change:

| If this stops working | We move to | What changes |
|---|---|---|
| Render Web Service | Koyeb or Northflank (free, Docker) | A new service and deploy hook; the image is the same |
| Render Static Site | GitHub Pages | The SPA build is the same; the rewrite rule becomes a `404.html` copy |
| Supabase | Neon | Only `DATABASE_URL`; the API applies the migrations itself at start-up |
| Gemini | Groq (OpenAI-compatible API) | Only `app/services/gemini.py`; the rest of the app sees the same draft |

Two decisions make these swaps cheap. The API depends only on environment variables
(`DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `ALLOWED_ORIGINS`), never on a provider's SDK. And the
same Docker image runs in Compose, in CI and on Render, so "it works on another host" can be tested on a
laptop before anything is moved.

## 1.4 What we would choose with a budget

A paid Render instance (no sleep) would remove the cold start, the most visible weakness in a demo, and a
paid Supabase plan would remove the 7-day pause and add point-in-time backups. The architecture would not
change: the same image, the same environment variables, the same pipeline.
