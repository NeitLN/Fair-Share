# End-to-end tests

Playwright drives a real browser against a running web app. The default target is the live site,
so these tests are slower than the Vitest suite and never run in `npm test` or on every pull
request.

```bash
npm run e2e                                              # live site
E2E_BASE_URL=http://localhost:3000 npm run e2e           # local stack (docker compose up)
npx playwright test --list                               # list the tests without running them
```

The browser needs to be installed once on a new machine: `npx playwright install chromium`.
Report output (`playwright-report/`, `test-results/`) is git-ignored.

## Accounts

The API allows 30 sign-ups and 20 sign-ins per address per hour, and the live smoke test runs after
every merge. So each run signs up four shared accounts once, before any spec (`global-setup.ts`:
Tiến, Minh, Duy Anh, An, kept in the git-ignored `.auth/`), and specs take them with `shared(name)`.
Each test still builds its own household through the API and deletes it at the end, so tests running
side by side never touch the same household. A test that changes an account (its name, password,
status, gender or photo) or signs up in the page makes its own with `signUp()`; never change a shared
one. Tests do not sign in to get a session: the one that signing up returns is put in the page
(`signInPage()`). Measured on the local stack on 08/11: a run uses 12 sign-ups (it used 27 before)
and 2 sign-ins (the password test checks the old and new passwords), so two runs in an hour still fit.
