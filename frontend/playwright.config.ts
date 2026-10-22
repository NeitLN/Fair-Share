import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end smoke tests against a running web app: the live site by default, or a local stack
 * with E2E_BASE_URL=http://localhost:3000. The API on the free tier sleeps, so a test may wait
 * through a cold start; nothing here runs in npm test or on every pull request.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://fair-share-web.onrender.com',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 } },
    },
  ],
})
