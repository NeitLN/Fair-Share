# 1. Platform selection rationale

*Owner: Việt Tiến. Sources: [ARCHITECTURE.md §7](../ARCHITECTURE.md#7-platform-selection-and-declared-fallbacks-zero-credit-card),
[OUTAGES.md](../OUTAGES.md); facts checked on the live services in October 2026.*

Fair-Share needs five things: run a Docker API, serve a React SPA, keep data in managed PostgreSQL, call
an AI model from the server, and build, test and deploy on every merge. Three constraints decided every
choice: **no credit card** (none of us could attach one), **our own Docker image** on the API host (the
same one Compose runs), and **one way to deploy**: by the pipeline after a reviewed merge, never by a push.

| Need | Chosen | Why it won over the alternatives | Declared fallback |
|---|---|---|---|
| API | **Render Web Service** (Docker) | Any Dockerfile, free, no card; a deploy hook lets CI decide when to deploy. Railway and Fly.io ask for a card; Vercel runs functions, not a container | Koyeb or Northflank: same image |
| SPA | **Render Static Site** | Same hook model, a CDN that never sleeps, a rewrite rule for deep links (vs GitHub Pages, Netlify) | GitHub Pages |
| Database | **Supabase** PostgreSQL | Plain PostgreSQL behind one `DATABASE_URL`, as locally. Render's free database is deleted after 30 days; Neon was close | Neon: only the URL changes |
| AI | **Gemini** `gemini-3.5-flash-lite` | Free key without a card, answers in our JSON schema, understands "240k" (vs Groq, OpenRouter) | Groq: only `gemini.py` changes |
| CI/CD | **GitHub Actions** | Code and reviews already on GitHub; branch protection reads the jobs (vs GitLab CI, Jenkins) | — |

The swaps stay cheap because the API depends only on environment variables, never on a provider's SDK,
and the same image runs in Compose, in CI and on Render. Free plans change, so a fallback must be checked
again for "no card" before switching.

**What the free plans cost us, and how we live with it**

| Limit | What we did |
|---|---|
| The Render API **sleeps after ~15 minutes**; the next request takes about 50 s | Loading states in the page; the demo runbook wakes it first (T-38) |
| A Supabase free project **pauses after 7 days** idle | A daily workflow runs a real query (T-26); `/health` never touches the database, so a pause cannot make Render restart the API |
| Supabase's direct host is **IPv6 only**; Render has no IPv6 egress | Connect through Supabase's **session pooler** (IPv4, TLS) |
| Gemini's free quota is **per minute and per day** | Our own limits sit below it (section 6); every failure leaves the manual form |
| No support on any free plan | Our own backups and restore drill (T-27, section 5) |

With a budget, a paid Render instance would remove the cold start and a paid Supabase plan the pause,
with point-in-time backups. The architecture would not change.
