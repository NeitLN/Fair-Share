import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { useElapsedSeconds } from './useElapsedSeconds'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useElapsedSeconds', () => {
  test('stays at 0 while not running', () => {
    const { result } = renderHook(() => useElapsedSeconds(false))

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current).toBe(0)
  })

  test('counts one second at a time from the moment it starts running', () => {
    const { result } = renderHook(() => useElapsedSeconds(true))
    expect(result.current).toBe(0)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current).toBe(1)

    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(result.current).toBe(5)
  })

  test('goes back to 0 when running turns false', () => {
    const { result, rerender } = renderHook(({ running }) => useElapsedSeconds(running), {
      initialProps: { running: true },
    })

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current).toBe(3)

    rerender({ running: false })
    expect(result.current).toBe(0)
  })

  test('clears its interval when unmounted', () => {
    const { unmount } = renderHook(() => useElapsedSeconds(true))
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
