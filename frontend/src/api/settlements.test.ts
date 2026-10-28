import { afterEach, expect, test, vi } from 'vitest'

import { createSettlement, deleteSettlement, getBalances, listSettlements } from './settlements'
import type { SettlementInput } from './types'

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

const payBack: SettlementInput = {
  from_member_id: 2,
  to_member_id: 1,
  amount: 120_000,
  settled_at: '2026-10-20',
}

test.each([
  ['list settlements', () => listSettlements(7), 'GET', '/api/households/7/settlements', undefined],
  ['record a settlement', () => createSettlement(7, payBack), 'POST', '/api/households/7/settlements', JSON.stringify(payBack)],
  ['delete a settlement', () => deleteSettlement(4, 7), 'DELETE', '/api/settlements/4', undefined],
  ['read the balances', () => getBalances(7), 'GET', '/api/households/7/balances', undefined],
] as const)('%s', async (_name, call, method, url, body) => {
  const lastCall = captureFetch()
  await call()
  expect(lastCall()).toEqual({ url, method, body })
})
