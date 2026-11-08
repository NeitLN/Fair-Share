import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { resetAiAvailability, useAiAvailability } from './aiAvailability'

afterEach(() => {
  resetAiAvailability()
  vi.unstubAllGlobals()
})

const answer = (status: number, body: unknown) => {
  const fetchFn = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })))
  vi.stubGlobal('fetch', fetchFn)
  return fetchFn
}

test('asked once for the page, shared by every component', async () => {
  const fetchFn = answer(200, { app: 'Fair-Share', ai: true })
  const first = renderHook(() => useAiAvailability())
  const second = renderHook(() => useAiAvailability())
  await waitFor(() => expect(first.result.current).toBe('on'))
  await waitFor(() => expect(second.result.current).toBe('on'))
  // Mounted later, it knows at once
  expect(renderHook(() => useAiAvailability()).result.current).toBe('on')
  expect(fetchFn).toHaveBeenCalledTimes(1)
  expect(fetchFn.mock.calls[0]).toEqual(expect.arrayContaining(['/api/version']))
})

test('"ai": false is off', async () => {
  answer(200, { ai: false })
  const { result } = renderHook(() => useAiAvailability())
  await waitFor(() => expect(result.current).toBe('off'))
})

test('a failed question or a server without the field stays unknown', async () => {
  answer(503, { error: { code: 'x', message: 'x' } })
  const failed = renderHook(() => useAiAvailability())
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(failed.result.current).toBe('unknown')

  resetAiAvailability()
  answer(200, { app: 'Fair-Share' })
  const older = renderHook(() => useAiAvailability())
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(older.result.current).toBe('unknown')
})
