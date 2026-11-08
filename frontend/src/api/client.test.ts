import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { currentSession, signIn, signOut } from '../lib/session'
import { resetSlowRequests, slowState } from '../lib/slowRequests'
import { api, ApiError, KEY_HEADER } from './client'

function mockFetch(response: Response | Error) {
  const fn = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api client', () => {
  test('returns the parsed JSON body', async () => {
    mockFetch(json(200, [{ id: 1, name: 'Nhà 12' }]))
    await expect(api.get('/api/households')).resolves.toEqual([{ id: 1, name: 'Nhà 12' }])
  })

  test('sends JSON with the right method and header', async () => {
    const fetchFn = mockFetch(json(201, { id: 2 }))
    await api.post('/api/households', { name: 'Nhà 12' })

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/households')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"name":"Nhà 12"}')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
  })

  test('returns undefined for 204 No Content', async () => {
    mockFetch(new Response(null, { status: 204 }))
    await expect(api.delete('/api/members/3')).resolves.toBeUndefined()
  })

  test('turns our error format into an ApiError', async () => {
    mockFetch(json(409, { error: { code: 'member_in_use', message: 'Thành viên đã có chi tiêu' } }))
    const err = await api.delete('/api/members/3').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({
      status: 409,
      code: 'member_in_use',
      message: 'Thành viên đã có chi tiêu',
    })
  })

  test("understands FastAPI's default {detail} errors", async () => {
    mockFetch(json(404, { detail: 'Item not found' }))
    await expect(api.get('/api/households/9')).rejects.toMatchObject({
      status: 404,
      message: 'Item not found',
    })
  })

  test('gives a generic message when the error body is not JSON', async () => {
    mockFetch(new Response('<html>Bad Gateway</html>', { status: 502 }))
    await expect(api.get('/api/households')).rejects.toMatchObject({
      status: 502,
      code: 'error',
    })
  })

  test('reports a network failure as status 0', async () => {
    mockFetch(new TypeError('Failed to fetch'))
    await expect(api.get('/api/households')).rejects.toMatchObject({
      status: 0,
      code: 'network_error',
    })
  })
})

describe('the session (docs/ACCOUNTS.md)', () => {
  const user = { id: 9, email: 'tien@test.local', display_name: 'Tiến' }
  afterEach(() => signOut())

  const sent = (status = 200) => {
    const fetchFn = vi.fn(() => Promise.resolve(json(status, { error: { code: 'x', message: 'x' } })))
    vi.stubGlobal('fetch', fetchFn)
    return () => new Headers((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].headers)
  }

  test('its token goes in the Authorization header of every request', async () => {
    signIn({ token: 'abc', user })
    const headers = sent()
    await api.delete('/api/expenses/12', 7)
    expect(headers().get('Authorization')).toBe('Bearer abc')
  })

  test('signed out, no Authorization header is sent', async () => {
    const headers = sent()
    await api.post('/api/auth/login', { email: 'a@b.vn', password: 'x' })
    expect(headers().get('Authorization')).toBeNull()
  })

  test('a 401 means the session ended: this browser signs out', async () => {
    signIn({ token: 'old', user })
    sent(401)
    await expect(api.get('/api/households')).rejects.toMatchObject({ status: 401 })
    expect(currentSession()).toBeNull()
  })

  test('a wrong password is a 401 too, but signing in again does not sign anyone out', async () => {
    signIn({ token: 'still-good', user })
    sent(401)
    await expect(api.post('/api/auth/login', { email: 'a@b.vn', password: 'x' })).rejects.toMatchObject({
      status: 401,
    })
    expect(currentSession()?.token).toBe('still-good')
  })

  // specs/010-profile-page: the current password on the profile page is a 400, so the session stays
  test('a wrong current password when changing it does not sign out; a 401 there still does', async () => {
    signIn({ token: 'still-good', user })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json(400, { error: { code: 'wrong_password', message: 'x' } }))))
    const body = { current_password: 'x', new_password: 'mat-khau-moi-1' }
    await expect(api.post('/api/me/password', body)).rejects.toMatchObject({ code: 'wrong_password' })
    expect(currentSession()?.token).toBe('still-good')
    sent(401)
    await expect(api.post('/api/me/password', body)).rejects.toMatchObject({ status: 401 })
    expect(currentSession()).toBeNull()
  })

  // A request from the last account that answers after someone else signed in on this tab
  function answersLate(status: number, body: unknown) {
    let answer: (response: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))))
    return () => answer(json(status, body))
  }

  test('a late 401 for the last account does not sign the new one out', async () => {
    signIn({ token: 'old', user })
    const answer = answersLate(401, { error: { code: 'not_authenticated', message: 'x' } })
    const pending = api.get('/api/households')
    signIn({ token: 'new', user: { ...user, id: 10 } })
    answer()
    await expect(pending).rejects.toMatchObject({ code: 'session_changed' })
    expect(currentSession()?.token).toBe('new')
  })

  test("the last account's data is thrown away, not handed to the new one", async () => {
    signIn({ token: 'old', user })
    const answer = answersLate(200, [{ id: 1, name: 'Nhà của người trước' }])
    const pending = api.get('/api/households')
    signIn({ token: 'new', user: { ...user, id: 10 } })
    answer()
    await expect(pending).rejects.toMatchObject({ code: 'session_changed' })
  })

  test('the old household key is only sent where the caller gives it', async () => {
    const headers = sent()
    await api.get('/api/households/7/claim', undefined, { [KEY_HEADER]: 'a'.repeat(32) })
    expect(headers().get(KEY_HEADER)).toBe('a'.repeat(32))
  })
})

// specs/011-first-impressions, FR-007 to FR-009: a request waiting more than 5 s turns the notice on, and
// every way it can end turns it off again
describe('slow requests', () => {
  const user = { id: 9, email: 'tien@test.local', display_name: 'Tiến' }
  beforeEach(() => {
    vi.useFakeTimers()
    resetSlowRequests()
  })
  afterEach(() => {
    signOut()
    resetSlowRequests()
    vi.useRealTimers()
  })

  function held() {
    let settle: (outcome: Response | Error) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve, reject) => (settle = (o) => (o instanceof Error ? reject(o) : resolve(o))))),
    )
    return (outcome: Response | Error) => settle(outcome)
  }

  test('an answer read after 6 s: slow while waiting, not once read', async () => {
    const settle = held()
    const pending = api.get('/api/households')
    vi.advanceTimersByTime(6_000)
    expect(slowState().slow).toBe(true)
    settle(json(200, []))
    await pending
    expect(slowState().slow).toBe(false)
  })

  test('a network failure, a refusal and a 401 all end it', async () => {
    signIn({ token: 'old', user })
    for (const outcome of [new TypeError('Failed to fetch'), json(409, { error: { code: 'x', message: 'x' } }), json(401, {})]) {
      const settle = held()
      const pending = api.get('/api/households').catch(() => null)
      vi.advanceTimersByTime(6_000)
      expect(slowState().slow).toBe(true)
      settle(outcome)
      await pending
      expect(slowState().slow).toBe(false)
    }
  })

  test('an answer for the last account after someone else signed in ends it too', async () => {
    signIn({ token: 'old', user })
    const settle = held()
    const pending = api.get('/api/households').catch((error: unknown) => error)
    vi.advanceTimersByTime(6_000)
    signIn({ token: 'new', user: { ...user, id: 10 } })
    settle(json(200, []))
    expect(await pending).toMatchObject({ code: 'session_changed' })
    expect(slowState().slow).toBe(false)
  })
})

