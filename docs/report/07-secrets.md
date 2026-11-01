# 7. Secret and configuration management

*Owner: Việt Tiến. Sources: [ARCHITECTURE.md §8](../ARCHITECTURE.md#8-configuration-and-secrets),
[SECRET_AUDIT.md](../SECRET_AUDIT.md) (T-29), [`.gitleaks.toml`](../../.gitleaks.toml), `app/config.py`.*

The rule: **configuration comes from the environment, and no secret is ever in the repository**, not in
the current files and not in any old commit. The same code runs on a laptop, in CI and on Render; only the
environment differs. `app/config.py` reads and checks every setting once at start-up (for example
`AI_TIMEOUT > 0`); nothing else reads the environment, and `.env.example` lists them all with safe values.

| Setting | Secret? | Laptop | CI | Production |
|---|---|---|---|---|
| `DATABASE_URL` | **yes** | built from `DB_PASSWORD`, optional git-ignored `.env` | throw-away URL to the job's own PostgreSQL | Render env var (Supabase pooler URL) |
| `GEMINI_API_KEY` | **yes** | `.env`, optional | **never**: Gemini is faked in tests | Render env var |
| `RENDER_DEPLOY_HOOK_API`, `_WEB` | **yes** | — | Actions secrets, used only by `deploy` | — |
| `VITE_API_BASE_URL` | no, **public** | empty (same origin) | empty | Static Site, build time |

Anything built into the React app is downloaded by every visitor, which is exactly why the database URL
and the AI key may only live on the API server. The households' invite keys (#132) are not configuration
but data: one per household in the database, sent only to the browser that creates it, and never logged
in production (only the local demo seed prints its own household's link).

**How a secret is kept out of Git**

| Control | What it catches |
|---|---|
| `.gitignore` covers `.env` and `.env.*`; `.env.example` has placeholders | The most common leak: committing the local `.env` |
| **`secrets` job:** gitleaks over the branch's **whole history** on every pull request and merge, redacted; `deploy` waits for it | A key in any commit, even one later deleted, before it reaches `main` |
| Our gitleaks rule `postgres-url-with-password` | gitleaks has **no default rule for database URLs**, our most important secret. Hoàng Minh showed it in review with a fake Supabase URL the default rules missed |
| **GitHub secret scanning and push protection** | A push with a recognised provider key is refused |
| Every screenshot checked before it enters the repository or the report | Keys visible in a dashboard picture |

**The audit (T-29, 20/10)** checked the past before relying on these controls: gitleaks over **every
commit on every branch** (122) and the working copy, every `.env` ever committed (none), every database URL
in the history and every image that could be a screenshot. **No leaks.** The one finding was a false positive: our Render service id in the workflow, which names the
service so `deploy` can check a hook belongs to it, and triggers nothing without the hook's key. It is
allowed in `.gitleaks.toml` with that reason. The only passwords in the history are the Compose default and
CI's `ci-only-not-a-secret`.

**If a key leaks.** The order matters: **stop the key working first**, then clean up.
1. Revoke it at once: AI Studio → delete the key; Supabase → reset the password; Render → regenerate the
   hook.
2. Put a new value only where it lives (Render env vars, Actions secrets), redeploy, check `/health/db` and
   a Quick add.
3. Find how it leaked: gitleaks on the full history, Actions logs, recent screenshots.
4. If it reached Git, rewrite history with `git filter-repo` with the team's agreement, but treat the old
   value as **compromised forever**: forks, clones and caches keep it, which is why step 1 comes first.
5. Open an issue with what happened and the prevention added, as we did for the outages
   ([OUTAGES.md](../OUTAGES.md)).

With more time we would use a secret manager with rotation instead of values typed into two dashboards.
For three people and two production secrets, environment variables plus these controls were proportionate.
