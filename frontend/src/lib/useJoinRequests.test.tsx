import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { mockApi } from '../test/renderApp'
import { useJoinRequests, WAITING_CHECK_MS } from './useJoinRequests'

// The page in front; a test below puts it in the background
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  focusManager.setFocused(true)
})
afterEach(() => {
  focusManager.setFocused(undefined)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const waiting = { household_id: 12, requested_at: '', household_name: 'Nhà trọ Q7', owner_name: 'Tiến' }
const checks = (fetchFn: ReturnType<typeof mockApi>) => fetchFn.mock.calls.filter(([url]) => url === '/api/me/requests').length

test('asks again every 10 seconds while a request waits, and stops when none does', async () => {
  let pending = [waiting]
  const fetchFn = mockApi({ 'GET /api/me/requests': () => [200, { pending, joined: [], outcomes: [] }] })
  renderHook(() => useJoinRequests(vi.fn()), { wrapper })
  await vi.waitFor(() => expect(checks(fetchFn)).toBe(1))
  await act(() => vi.advanceTimersByTimeAsync(WAITING_CHECK_MS))
  await vi.waitFor(() => expect(checks(fetchFn)).toBe(2))
  pending = []
  await act(() => vi.advanceTimersByTimeAsync(WAITING_CHECK_MS))
  await vi.waitFor(() => expect(checks(fetchFn)).toBe(3))
  // Nothing waits any more: no further checks
  await act(() => vi.advanceTimersByTimeAsync(WAITING_CHECK_MS * 3))
  expect(checks(fetchFn)).toBe(3)
})

test('an approval is told once; a cancellation is not', async () => {
  let answer = { pending: [waiting, { ...waiting, household_id: 13, household_name: 'Nhà B' }], joined: [] as number[], outcomes: [] }
  mockApi({ 'GET /api/me/requests': () => [200, answer] })
  const onApproved = vi.fn()
  renderHook(() => useJoinRequests(onApproved), { wrapper })
  await vi.waitFor(() => expect(onApproved).not.toHaveBeenCalled())
  await act(() => vi.advanceTimersByTimeAsync(10))
  // 12 approved, 13 cancelled elsewhere
  answer = { pending: [], joined: [12], outcomes: [] }
  await act(() => vi.advanceTimersByTimeAsync(WAITING_CHECK_MS))
  await vi.waitFor(() => expect(onApproved).toHaveBeenCalledTimes(1))
  expect(onApproved).toHaveBeenCalledWith(expect.objectContaining({ household_id: 12 }))
})

test('in the background it does not ask; back in front it asks at once', async () => {
  const fetchFn = mockApi({ 'GET /api/me/requests': () => [200, { pending: [waiting], joined: [], outcomes: [] }] })
  renderHook(() => useJoinRequests(vi.fn()), { wrapper })
  await vi.waitFor(() => expect(checks(fetchFn)).toBe(1))
  act(() => focusManager.setFocused(false))
  await act(() => vi.advanceTimersByTimeAsync(WAITING_CHECK_MS * 3))
  expect(checks(fetchFn)).toBe(1)
  act(() => focusManager.setFocused(true))
  await vi.waitFor(() => expect(checks(fetchFn)).toBe(2))
})
