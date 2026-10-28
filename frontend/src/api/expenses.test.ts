import { afterEach, expect, test, vi } from 'vitest'

import { createExpense, deleteExpense, listExpenses, updateExpense } from './expenses'
import type { ExpenseInput } from './types'

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

const dinner: ExpenseInput = {
  description: 'Ăn tối',
  amount: 240_000,
  payer_id: 1,
  spent_at: '2026-10-20',
  split: { type: 'equal', member_ids: [1, 2, 3] },
}

test.each([
  ['list expenses', () => listExpenses(7), 'GET', '/api/households/7/expenses', undefined],
  ['create an expense', () => createExpense(7, dinner), 'POST', '/api/households/7/expenses', JSON.stringify(dinner)],
  ['replace an expense', () => updateExpense(12, dinner, 7), 'PUT', '/api/expenses/12', JSON.stringify(dinner)],
  ['delete an expense', () => deleteExpense(12, 7), 'DELETE', '/api/expenses/12', undefined],
] as const)('%s', async (_name, call, method, url, body) => {
  const lastCall = captureFetch()
  await call()
  expect(lastCall()).toEqual({ url, method, body })
})
