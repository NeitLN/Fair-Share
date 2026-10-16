import { afterEach, expect, test, vi } from 'vitest'

import {
  addMember,
  createHousehold,
  getHousehold,
  listHouseholds,
  listMembers,
  removeMember,
  renameMember,
} from './households'

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

test.each([
  ['list households', () => listHouseholds(), 'GET', '/api/households', undefined],
  ['get one household', () => getHousehold(7), 'GET', '/api/households/7', undefined],
  ['create a household', () => createHousehold('Nhà 12'), 'POST', '/api/households', '{"name":"Nhà 12"}'],
  ['list members', () => listMembers(7), 'GET', '/api/households/7/members', undefined],
  ['add a member', () => addMember(7, 'Minh'), 'POST', '/api/households/7/members', '{"name":"Minh"}'],
  ['rename a member', () => renameMember(3, 'Tiến'), 'PATCH', '/api/members/3', '{"name":"Tiến"}'],
  ['remove a member', () => removeMember(3), 'DELETE', '/api/members/3', undefined],
] as const)('%s', async (_name, call, method, url, body) => {
  const lastCall = captureFetch()
  await call()
  expect(lastCall()).toEqual({ url, method, body })
})
