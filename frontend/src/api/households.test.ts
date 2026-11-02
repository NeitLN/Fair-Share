import { afterEach, expect, test, vi } from 'vitest'

import {
  approveRequest,
  cancelRequest,
  createHousehold,
  getHousehold,
  getInvite,
  join,
  leaveHousehold,
  listMembers,
  listMyHouseholds,
  login,
  register,
  rejectRequest,
  removeMember,
  removePerson,
  renameMember,
  renewInvite,
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
  ['register', () => register('a@b.vn', 'mat-khau-dai', 'Tiến'), 'POST', '/api/auth/register',
    '{"email":"a@b.vn","password":"mat-khau-dai","display_name":"Tiến"}'],
  ['sign in', () => login('a@b.vn', 'mat-khau-dai'), 'POST', '/api/auth/login',
    '{"email":"a@b.vn","password":"mat-khau-dai"}'],
  ['my households', () => listMyHouseholds(), 'GET', '/api/households', undefined],
  ['get one household', () => getHousehold(7), 'GET', '/api/households/7', undefined],
  ['create a household', () => createHousehold('Nhà 12'), 'POST', '/api/households', '{"name":"Nhà 12"}'],
  ['leave a household', () => leaveHousehold(7), 'POST', '/api/households/7/leave', '{}'],
  ['list members', () => listMembers(7), 'GET', '/api/households/7/members', undefined],
  ['rename a member', () => renameMember(3, 'Tiến', 7), 'PATCH', '/api/members/3', '{"name":"Tiến"}'],
  ['remove a member', () => removeMember(3, 7), 'DELETE', '/api/members/3', undefined],
  ['the invite code', () => getInvite(7), 'GET', '/api/households/7/invite', undefined],
  ['a new invite code', () => renewInvite(7), 'POST', '/api/households/7/invite', '{}'],
  ['join with a code', () => join('ABCD-EFGH'), 'POST', '/api/join', '{"code":"ABCD-EFGH"}'],
  ['cancel a request', () => cancelRequest(7), 'DELETE', '/api/me/requests/7', undefined],
  ['approve with a new name', () => approveRequest(7, 4), 'POST', '/api/households/7/requests/4/approve', '{}'],
  ['approve onto a name', () => approveRequest(7, 4, { member_id: 2 }), 'POST',
    '/api/households/7/requests/4/approve', '{"member_id":2}'],
  ['decline', () => rejectRequest(7, 4), 'POST', '/api/households/7/requests/4/reject', '{}'],
  ['remove someone', () => removePerson(7, 4), 'DELETE', '/api/households/7/people/4', undefined],
] as const)('%s', async (_name, call, method, url, body) => {
  const lastCall = captureFetch()
  await call()
  expect(lastCall()).toEqual({ url, method, body })
})
