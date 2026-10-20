# Secret audit (T-29)

**Date:** 20 Oct 2026 · **Auditor:** Võ Việt Tiến · **Repository:** `NeitLN/Fair-Share`, all branches

The brief requires that the repository contains no key, connection string or `.env` file, in the current
files or in the history. This is the record of how we checked it, what we found, and what keeps it true.

## What was checked

| Check | How | Result |
|---|---|---|
| Every commit on every branch | `gitleaks git --log-opts=--all` (v8.30.1, default rules), 119 commits | 1 finding, a false positive (below) |
| The same, with our database-URL rule (added after review) | `--log-opts=--all`, 122 commits | No leaks |
| The files on disk, including untracked ones | `gitleaks dir` on the working copy | No leaks |
| `.env` files ever committed | `git log --all -- .env '**/.env'` | Never |
| Database URLs with a password | Every `postgres://user:password@host` in `git log --all -p` | Only local or test values: the Compose default `fairshare_local`, the CI service container `ci-only-not-a-secret`, the README example `devonly`, test fixtures `test` and `pw`. **No Supabase URL** |
| Images that could be screenshots of a dashboard | Every image file in the history | One: `frontend/src/assets/hero.png`, the Vite template picture |

## The one finding

`generic-api-key` on `.github/workflows/ci-cd.yml`: `srv-db3k8udg1s2s73aqcpug`, the id of the Render API
service. It only **names** the service, and the deploy job uses it to check that the deploy hook belongs to
the right service (#64). Without the hook's own key it cannot trigger or change anything, so it is
not a secret. It is allowed in [`.gitleaks.toml`](../.gitleaks.toml) by its pattern, with that reason.

## A gap found in review: database URLs

gitleaks has **no default rule for database connection strings**, and `DATABASE_URL` is our most
important secret. Hoàng Minh showed it in the review of #93 by planting fakes in a throw-away repository:
a Gemini key and a Render deploy hook were caught, a Supabase pooler URL with its password was not.
`.gitleaks.toml` now adds `postgres-url-with-password`, which flags any `postgres://user:password@…`
except the local and test passwords listed above. Re-tested: it catches a planted Supabase URL and finds
nothing in the real history (122 commits, all branches).

## What keeps it true from now on

- **CI:** the `secrets` job runs gitleaks (default rules + the database-URL rule) on the branch's whole
  history for every pull request and every merge;
  `deploy` waits for it. It prints findings redacted, so a real key would not end up in the log either.
- **GitHub secret scanning and push protection** (repository settings): a push containing a recognised
  provider key is blocked before it reaches GitHub.
- **Where secrets live:** Render environment variables (`DATABASE_URL`, `GEMINI_API_KEY`) and GitHub
  Actions secrets (`RENDER_DEPLOY_HOOK_API`, `RENDER_DEPLOY_HOOK_WEB`). `.env` and `.env.*` are
  git-ignored; `.env.example` has no real values.
- **If one leaks anyway:** the runbook in [ARCHITECTURE.md §8](ARCHITECTURE.md#8-configuration-and-secrets)
  (revoke at the provider first, then replace, then find how it leaked).

## How to repeat it

```bash
docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.30.1 \
  git /repo --config /repo/.gitleaks.toml --log-opts="--all" --redact -v
```
