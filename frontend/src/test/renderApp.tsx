import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'

import App from '../App'
import { signIn, signOut } from '../lib/session'
import LocationProbe from './LocationProbe'

type Reply = [status: number, body?: unknown]
type Handler = Reply | ((body: unknown, init: RequestInit) => Reply | Promise<Reply>)

/**
 * Replace fetch with a fake API. Keys are "METHOD /path", e.g. "GET /api/households".
 * Anything not listed answers 404 like FastAPI does. Returns the spy to inspect calls.
 */
export function mockApi(routes: Record<string, Handler>) {
  const fetchFn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const handler = routes[key] ?? routes[key.split('?')[0]]
    if (!handler) return json(404, { detail: 'Not Found' })
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    // A handler may answer later, for tests of what the page shows while a request is slow
    const [status, payload] = typeof handler === 'function' ? await handler(body, init) : handler
    return status === 204 ? new Response(null, { status }) : json(status, payload)
  })
  vi.stubGlobal('fetch', fetchFn)
  return fetchFn
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** The account tests are signed in with, unless they sign out first (docs/ACCOUNTS.md). */
export const testUser = { id: 9, email: 'tien@test.local', display_name: 'Tiến' }

/**
 * The whole app at `path` (or at a path with navigation state, as a link with `state` opens it), with a
 * fresh cache and no retries so failures show at once. Signed in as `testUser`, unless `signedOut` is set.
 */
export function renderApp(path: string | { pathname: string; state: unknown }, { signedOut = false } = {}) {
  if (signedOut) signOut()
  else signIn({ token: 'test-token', user: testUser })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  // The cache too, for tests that check what stays in it
  return { ...view, client }
}
