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
