import { afterEach, expect, test, vi } from 'vitest'

import {
  acceptNotice,
  cancelNotice,
  createSettlement,
  declineNotice,
  deleteSettlement,
  getBalances,
  listSettlements,
  sendNotice,
} from './settlements'
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
  // specs/014: every notice action names the version its screen showed
  ['tell a transfer', () => sendNotice(7, 1, 100_000, null), 'PUT', '/api/households/7/notices',
    JSON.stringify({ to_member_id: 1, amount: 100_000, version: null })],
  ['take a notice back', () => cancelNotice(7, 1, 12), 'DELETE', '/api/households/7/notices/1?version=12', undefined],
  ['confirm part of a notice', () => acceptNotice(7, 2, { version: 12, received: 60_000, settledAt: '2026-11-09' }),
    'POST', '/api/households/7/notices/2/accept',
    JSON.stringify({ version: 12, received: 60_000, settled_at: '2026-11-09' })],
  ['decline a notice', () => declineNotice(7, 2, 12), 'POST', '/api/households/7/notices/2/decline',
    JSON.stringify({ version: 12 })],
  ['record told money by hand', () => createSettlement(7, { ...payBack, notice: { version: 12 } }), 'POST',
    '/api/households/7/settlements', JSON.stringify({ ...payBack, notice: { version: 12 } })],
] as const)('%s', async (_name, call, method, url, body) => {
  const lastCall = captureFetch()
  await call()
  expect(lastCall()).toEqual({ url, method, body })
})
