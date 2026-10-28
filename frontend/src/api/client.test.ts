import { afterEach, describe, expect, test, vi } from 'vitest'

import { remember } from '../lib/knownHouseholds'
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

describe('the household key (#132)', () => {
  afterEach(() => localStorage.clear())

  const sentKey = () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })),
    )
    vi.stubGlobal('fetch', fetchFn)
    return () => new Headers((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get(KEY_HEADER)
  }

  test('is sent with every request about a household this browser holds the key of', async () => {
    remember(7, 'a'.repeat(32))
    const key = sentKey()
    await api.get('/api/households/7/balances')
    expect(key()).toBe('a'.repeat(32))
  })

  test('is sent for a member, expense or settlement when the caller names the household', async () => {
    remember(7, 'b'.repeat(32))
    const key = sentKey()
    await api.delete('/api/expenses/12', 7)
    expect(key()).toBe('b'.repeat(32))
  })

  test('is not sent for another household, nor when creating one', async () => {
    remember(7, 'c'.repeat(32))
    const other = sentKey()
    await api.get('/api/households/8')
    expect(other()).toBeNull()
    const create = sentKey()
    await api.post('/api/households', { name: 'Nhà' })
    expect(create()).toBeNull()
  })
})

