# 7. Secret and configuration management

*Draft for report section 7 (owner: Việt Tiến). Sources: [ARCHITECTURE.md §8](../ARCHITECTURE.md#8-configuration-and-secrets),
[SECRET_AUDIT.md](../SECRET_AUDIT.md) (T-29), [`.gitleaks.toml`](../../.gitleaks.toml), `app/config.py`,
`.env.example`.*

The rule is simple: **configuration comes from the environment, and no secret is ever in the
repository**, not in the current files and not in any old commit. The same code runs on a laptop, in CI
and on Render; only the environment differs.

## 7.1 One place for settings

`app/config.py` reads every setting from environment variables once, at start-up, and checks them (for
example `AI_TIMEOUT` must be above 0, `FORWARDED_HOPS` cannot be negative). Nothing else in the code
reads the environment, so the full list of settings is one file, and `.env.example` documents it with
safe values.

| Setting | Secret? | Laptop (Compose) | CI | Production |
|---|---|---|---|---|
| `DATABASE_URL` | **yes** | built from `DB_PASSWORD` in a git-ignored `.env` | a throw-away URL to the job's own PostgreSQL container | Render env var: Supabase session pooler URL |
| `GEMINI_API_KEY` | **yes** | `.env`, optional | **never**: Gemini is replaced by a fake in tests | Render env var |
| `RENDER_DEPLOY_HOOK_API`, `_WEB` | **yes** | not needed | GitHub Actions secrets, used only by `deploy` | (on Render's side, they are the hooks) |
| `ALLOWED_ORIGINS`, `GEMINI_MODEL`, `AI_TIMEOUT`, `FORWARDED_HOPS`, `APP_ENV` | no | defaults | defaults | Render env vars where they differ from the default |
| `VITE_API_BASE_URL` | no, public | empty (same origin) | empty | Static Site env var, read at build time |

`VITE_API_BASE_URL` is deliberately **not** a secret: anything built into the React app is downloaded by
every visitor. That is exactly why the database URL and the AI key may only ever live on the API server.

## 7.2 How a secret is kept out of Git

| Control | What it catches |
|---|---|
| `.gitignore` covers `.env` and `.env.*`; `.env.example` holds placeholders only | The most common leak: committing the local `.env` |
| **`secrets` job in CI**: gitleaks over the branch's **whole history**, on every pull request and every merge, findings printed redacted; `deploy` waits for it | A key added in any commit, even one later deleted, before it can reach `main` |
| An extra gitleaks rule, `postgres-url-with-password` | gitleaks has **no default rule for database URLs**, our most important secret. Hoàng Minh showed this in review by planting a fake Supabase URL that the default rules missed; the rule now flags any `postgres://user:password@…` except the known local and test values |
| **GitHub secret scanning and push protection** | A push containing a recognised provider key is refused before it reaches GitHub |
| Review of every screenshot before it goes into the repository or the report | Keys or connection strings visible in a dashboard picture |

## 7.3 The audit (T-29, 20/10/2026)

Before relying on these controls we checked the past: gitleaks over **every commit on every branch**
(119, then 122 after the database-URL rule was added), the working copy including untracked files, every
`.env` ever committed (none), every database URL in the full history, and every image that could be a
dashboard screenshot.

- **No leaks.** One finding was a false positive: the id of our Render service in the workflow file. It
  only names the service, so the deploy job can check that a hook belongs to it; without the hook's own
  key it cannot trigger anything. It is allowed in `.gitleaks.toml` with that reason written next to it.
- The only passwords in the history are local or test values: the Compose default and the CI container's
  `ci-only-not-a-secret`.
- The full record, with the command to repeat it, is in [SECRET_AUDIT.md](../SECRET_AUDIT.md).

## 7.4 If a key leaks: our runbook

The order matters: **stop the key working first**, then clean up.

1. **Revoke it at the provider at once.** Google AI Studio → delete the key; Supabase → reset the
   database password; Render → regenerate the deploy hook.
2. **Create a new value and put it only where it lives**: Render environment variables or GitHub
   Actions secrets. Redeploy, and check the live API (`/health/db`, a Quick add request).
3. **Find how it leaked**: gitleaks on the full history, the Actions logs, recent screenshots.
4. **If it reached the Git history**: rewrite it with `git filter-repo` and force-push with the team's
   agreement, but treat the old value as **compromised forever**. Rewriting history does not un-leak a
   key that was already pushed: forks, clones and caches keep it. That is why step 1 comes first.
5. **Open an issue** describing what happened and the prevention added, as we did for the outages in
   [OUTAGES.md](../OUTAGES.md).

## 7.5 What we would add with more time

A secret manager with rotation (for example Doppler or the cloud provider's own) instead of values typed
into two dashboards, and a scheduled rotation of the Gemini key. For a three-person project with two
secrets in production, environment variables plus the controls above were proportionate.
