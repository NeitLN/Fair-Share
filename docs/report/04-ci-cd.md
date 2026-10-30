# 4. CI/CD pipeline walkthrough

*Owner: Việt Tiến. Sources: [`.github/workflows/ci-cd.yml`](../../.github/workflows/ci-cd.yml),
[`e2e.yml`](../../.github/workflows/e2e.yml), the Actions history; timings from the run of 26/10/2026 that
deployed #131.*

Every change reaches production one way: a pull request, four automatic checks, an approval from another
member, a merge, and a deploy that the pipeline proves went live. Nobody, the owner included, can push to
`main` or deploy by hand.

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
| `backend` | `ruff`, the migrations on a fresh **PostgreSQL 16 service container**, `pytest` (320 tests on 28/10: endpoints, schema rules written straight to the database, property tests of the money logic, the household keys) | Broken endpoints, wrong split or balance maths, a migration that fails on an empty database |
| `frontend` | `oxlint`, Vitest (component, hook and page tests), `vite build` with the type check | TypeScript errors, failing UI tests, an app that does not build |
| `images` | Builds and **starts** the API image, builds the web image, brings the Compose stack up and checks it end to end | A Dockerfile Render could not build, a container that crashes, a `compose.yml` that does not come up |
| `secrets` | gitleaks over the branch's **whole history**, plus our rule for database URLs (section 7) | A key or connection string, even in an old commit |

The four checks run in parallel, 12 to 57 seconds each. Branch protection requires all four plus one
approval, for administrators too.

**From merge to live, proven.** A Render deploy hook only *queues* a deploy, so the pipeline does not
stop at "the hook answered 200":

1. **`deploy`** runs only on a push to `main` after the four checks (`needs:`). `concurrency: production`
   serialises two quick merges. The hook is **pinned to the tested commit**, and the job refuses a hook
   that belongs to another Render service.
2. **`smoke`** polls `/api/version` until the live API reports the merged commit (or a later one that
   contains it), then loads the web app. If the new version never appears, the run goes red.
3. **E2E (live)**, after every green run on `main`: Playwright opens the live site at 360 px and walks the
   main flow (create a household, members, an expense, *Đã trả*, *Hoàn tác*), then deletes its household.
   It catches what unit tests cannot: the deployed app, API and database working together.

On 26/10: checks 57 s, `deploy` 7 s, `smoke` 46 s, about **2 minutes** from merge to proven live.

**Evidence that it blocks**

| When | What happened |
|---|---|
| 15/10, PR #15 (Lab 4) | A test changed on purpose went **red at 06:45** and the merge button stayed blocked; the fix turned it green at 06:54 and only then could it merge. Duy Anh and Hoàng Minh did the same on #18 and #79 |
| 22/10, draft PR #113 (`demo/red-gate`) | A plausible split bug (the leftover đồng is lost) that **lint accepts**: `backend` fails 8 of its 282 tests, the other checks pass. Never merged: it is the live demo of the gate |

In daily work the gate mostly shows up as reviews. Of the 80 pull requests merged by 27/10, every one from
#14 on (69) has an approval from another member; the 11 before (Labs 2 and 3) predate branch protection.
Several changed after review, for example #84 (the commit ran after the response) and #138 (a household
key check that `+7` could bypass).

**What we learned.** "Deployed" has to be measured: before `smoke`, a green run only meant "a deploy was
requested". And no secret needs to enter CI: Gemini is mocked and each job gets its own throw-away
PostgreSQL, so the only Actions secrets are the two deploy hooks.
