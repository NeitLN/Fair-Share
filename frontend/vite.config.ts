import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

// The commit this build is from: Render sets RENDER_GIT_COMMIT while it builds the static site. It
// goes into index.html, so the pipeline's smoke job can check that the new build went live (#153).
const commit = /^[0-9a-f]{7,40}$/.test(process.env.RENDER_GIT_COMMIT ?? '')
  ? (process.env.RENDER_GIT_COMMIT as string)
  : 'unknown'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'commit-meta',
      transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'commit', content: commit }, injectTo: 'head' }],
    },
  ],
  server: {
    // npm run dev: send /api to the API published by `docker compose up` on :8000, as nginx does
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Page tests render the whole app; on a busy laptop one can pass 5 s (the default) and fail
    // at random although it passes alone. 15 s still reports a real hang quickly.
    testTimeout: 15_000,
    // Playwright tests live in e2e/ and must not be picked up by Vitest
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
