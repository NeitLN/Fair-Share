# 4. CI/CD pipeline walkthrough

*Draft for report section 4 (owner: Việt Tiến). Sources: [`.github/workflows/ci-cd.yml`](../../.github/workflows/ci-cd.yml),
[`e2e.yml`](../../.github/workflows/e2e.yml), [ARCHITECTURE.md §9](../ARCHITECTURE.md#9-cicd-pipeline), the
Actions history of the repository. Timings from the run of 26/10/2026 that deployed #131.*

Every change reaches production the same way: a pull request, four automatic checks, one approving
review from another member, a merge, and a deploy that the pipeline itself proves went live. No one,
including the repository owner, can push to `main` directly or deploy by hand.

## 4.1 The pipeline

```
pull request ──► backend ─┐
             ├─► frontend ─┤   all green           merge to main
             ├─► images ───┼─► + 1 approval ──────► deploy ──► smoke ──► E2E (live)
             └─► secrets ──┘   (branch protection)   (Render     (live      (real browser,
                                                      hooks)      commit =   main flow)
                                                                  merged)
```

| Job | What it runs | What it keeps out of `main` |
|---|---|---|
| `backend` | `ruff check`, the migrations on a fresh **PostgreSQL 16 service container**, then `pytest` (290 tests: endpoints, schema rules written straight to the database, property tests of the money logic) | Lint errors, broken endpoints, wrong split or balance maths, a migration that fails on an empty database |
| `frontend` | `oxlint`, Vitest (component, hook and page tests), `vite build`, which also type-checks | TypeScript errors, failing UI tests, an app that does not build |
| `images` | Builds the API image and **starts it**, builds the web image, then brings up the whole Compose stack and checks that the web app reaches the API and the API reaches PostgreSQL | A Dockerfile Render could not build, a container that crashes on start, a `compose.yml` that does not come up |
| `secrets` | gitleaks over the branch's **whole history**, with an extra rule for database URLs (section 7) | A committed key or connection string, even in an old commit |

The four checks run in parallel; on 26/10 they took 12 to 57 seconds each, so a pull request knows its
result in about a minute. Branch protection on `main` requires all four plus one approving review, and is
enforced for administrators too.

## 4.2 From merge to live, proven

A deploy hook on Render only *queues* a deploy, and a queued deploy can fail or be slow. So the pipeline
does not stop at "the hook answered 200":

1. **`deploy`** runs only on a push to `main` and only after the four checks pass (`needs:`), so a pull
   request never deploys. `concurrency: production` makes two quick merges deploy one after the other,
   never at the same time. The hook is **pinned to the tested commit**, and the job refuses a hook that
   belongs to another Render service.
2. **`smoke`** polls the live API until `/api/version` reports the merged commit (or a later one that
   contains it), then checks that the web app loads. If the new version never appears, the run goes red
   and the team sees it.
3. **`E2E smoke (live)`** (a separate workflow, after every green run on `main`): Playwright opens the
   live site on a 360 px phone and walks the main flow: create a household, add members, an expense,
   *Đã trả* and *Hoàn tác*, back to settled. It deletes its test household afterwards and never calls
   Gemini. It catches what unit tests cannot: the deployed app, the API and Supabase working together.

On 26/10, from merge to a proven live deploy: checks 57 s, `deploy` 7 s, `smoke` 46 s, about **2 minutes**
in total.

## 4.3 Evidence that it blocks

| When | What happened | Result |
|---|---|---|
| 15/10, PR #15 (Lab 4) | A test was changed on purpose to expect `201` from `/health`. The required check went **red at 06:45**: the merge button stayed blocked. The fix was pushed to the same branch, the check went green at 06:54, and only then could it be merged (06:56) | The gate works on a real PR, for the owner too |
| 15–16/10, PRs #18 and #79 | The same exercise by Duy Anh and Hoàng Minh, so each member has seen a red gate on their own PR | Blocked, then fixed |
| 22/10, draft PR #113 (`demo/red-gate`) | A plausible bug in the equal split (the leftover đồng is lost) that **lint accepts**. `backend` fails with **8 of 282 tests**; `frontend`, `images` and `secrets` pass | Kept as a draft, never merged: it is the live demo of the gate for the assessment |

In daily work the gate mostly shows up as reviews rather than red builds. Of the 78 pull requests merged
by 27/10, every one from the CI lab onwards (#14 on, 74 of them) has an approval from another member; the
four before it predate branch protection. Several were changed after review before they went in, for
example #84, where a review found that the database commit ran after the response was sent.

## 4.4 Things we learned running it

- **Renaming a required check can freeze every PR.** When the Lab 4 `check` job was split into
  `backend`, `frontend` and `images` (#61), the required checks had to be switched in branch protection
  *before* merging, or every pull request would wait forever for a check that no longer exists.
- **"Deployed" has to be measured, not assumed.** Before the `smoke` job a green run only meant "a
  deploy was requested". Comparing the live `/api/version` with the merged commit turned it into a fact.
- **Secrets never enter CI.** The jobs need no Gemini key (Gemini is mocked) and no production database
  (each job gets its own throw-away PostgreSQL); the only secrets in Actions are the two deploy hooks,
  used by `deploy` alone.
