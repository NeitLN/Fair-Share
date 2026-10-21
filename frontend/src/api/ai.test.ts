import { afterEach, expect, test, vi } from 'vitest'

import { parseExpense } from './ai'

afterEach(() => {
  vi.unstubAllGlobals()
})

function captureFetch() {
  const fetchFn = vi.fn(() =>
    Promise.resolve(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ),
  )
  vi.stubGlobal('fetch', fetchFn)
  return () => {
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    return { url, method: init.method ?? 'GET', body: init.body }
  }
}

test('sends the sentence to the household AI endpoint', async () => {
  const lastCall = captureFetch()

  await parseExpense(7, 'lẩu 240k Minh trả chia đều cả nhà')

  expect(lastCall()).toEqual({
    url: '/api/households/7/ai/parse-expense',
    method: 'POST',
    body: JSON.stringify({ text: 'lẩu 240k Minh trả chia đều cả nhà' }),
  })
})
