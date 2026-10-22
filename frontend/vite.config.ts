import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // npm run dev: send /api to the API published by `docker compose up` on :8000, as nginx does
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Playwright tests live in e2e/ and must not be picked up by Vitest
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
