import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'

import App from '../App'

type Reply = [status: number, body?: unknown]
type Handler = Reply | ((body: unknown) => Reply)

/**
 * Replace fetch with a fake API. Keys are "METHOD /path", e.g. "GET /api/households".
 * Anything not listed answers 404 like FastAPI does. Returns the spy to inspect calls.
 */
export function mockApi(routes: Record<string, Handler>) {
  const fetchFn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const handler = routes[key]
    if (!handler) return json(404, { detail: 'Not Found' })
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    const [status, payload] = typeof handler === 'function' ? handler(body) : handler
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

/** The whole app at `path`, with a fresh cache and no retries so failures show at once. */
export function renderApp(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
