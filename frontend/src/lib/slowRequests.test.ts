import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { beginRequest, endRequest, resetSlowRequests, useSlowRequests } from './slowRequests'

beforeEach(() => {
  vi.useFakeTimers()
  resetSlowRequests()
})
afterEach(() => {
  resetSlowRequests()
  vi.useRealTimers()
})

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

test('a request is slow from 5 s on, not before, and the notice goes when it ends', () => {
  const { result } = renderHook(() => useSlowRequests())
  const token = beginRequest()
  wait(4_900)
  expect(result.current.slow).toBe(false)
  wait(100)
  expect(result.current).toEqual({ slow: true, announce: true })
  act(() => endRequest(token))
  expect(result.current.slow).toBe(false)
})

test('a request that answers in time never shows anything', () => {
  const { result } = renderHook(() => useSlowRequests())
  const token = beginRequest()
  wait(3_000)
  act(() => endRequest(token))
  wait(10_000)
  expect(result.current.slow).toBe(false)
})

test('two staggered requests: one notice, hidden only when both have ended', () => {
  const { result } = renderHook(() => useSlowRequests())
  const first = beginRequest()
  wait(2_000)
  const second = beginRequest()
  wait(5_000)
  expect(result.current.slow).toBe(true)
  act(() => endRequest(first))
  expect(result.current.slow).toBe(true)
  act(() => endRequest(second))
  expect(result.current.slow).toBe(false)
})

test('showing again within 10 s is the same episode, not announced; after 10 s it is', () => {
  const { result } = renderHook(() => useSlowRequests())
  let token = beginRequest()
  wait(5_000)
  act(() => endRequest(token))
  wait(9_000)
  token = beginRequest()
  wait(5_000)
  // Hidden for 9 s + the 5 s the new request waited = 14 s, so this one is new: measured from the hiding
  expect(result.current).toEqual({ slow: true, announce: true })
  act(() => endRequest(token))

  wait(1_000)
  token = beginRequest()
  wait(5_000)
  // Hidden 6 s: still the same episode
  expect(result.current).toEqual({ slow: true, announce: false })
  act(() => endRequest(token))
})

test('ending a token twice, or one never started, changes nothing', () => {
  const { result } = renderHook(() => useSlowRequests())
  const token = beginRequest()
  act(() => {
    endRequest(token)
    endRequest(token)
    endRequest(999)
  })
  wait(6_000)
  expect(result.current.slow).toBe(false)
})
