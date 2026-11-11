import { onlineManager } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { ApiError } from './client'
import { keys } from './households'
import { queryClient, UNKNOWN_REFRESH_MS } from './queryClient'

// specs/018-safe-saves, research R3
describe('money writes in the query client', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    onlineManager.setOnline(true)
    queryClient.clear()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  const run = (fail: unknown, meta?: { householdId?: number }) =>
    queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: () => Promise.reject(fail), meta })
      .execute(undefined)
      .catch(() => null)

  test('a result unknown refreshes the household now, after 10 s and after 30 s', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    await run(new ApiError(0, 'outcome_unknown', 'x'), { householdId: 7 })
    expect(UNKNOWN_REFRESH_MS).toEqual([0, 10_000, 30_000])
    vi.advanceTimersByTime(0)
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: keys.household(7) })
    vi.advanceTimersByTime(10_000)
    expect(invalidate).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(20_000)
    expect(invalidate).toHaveBeenCalledTimes(3)
  })

  test.each([
    ['offline', new ApiError(0, 'offline', 'x'), { householdId: 7 }],
    ['a refusal', new ApiError(409, 'notice_changed', 'x'), { householdId: 7 }],
    ['no household named', new ApiError(0, 'outcome_unknown', 'x'), undefined],
  ])('%s refreshes nothing', async (_name, fail, meta) => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    await run(fail, meta)
    vi.advanceTimersByTime(60_000)
    expect(invalidate).not.toHaveBeenCalled()
  })

  test('a write runs at once even when the app thinks it is offline, and is not retried', async () => {
    onlineManager.setOnline(false)
    const fn = vi.fn(() => Promise.reject(new ApiError(0, 'offline', 'x')))
    const done = queryClient.getMutationCache().build(queryClient, { mutationFn: fn }).execute(undefined).catch(() => 'failed')
    await vi.runAllTimersAsync()
    expect(await done).toBe('failed')
    expect(fn).toHaveBeenCalledOnce()
  })
})
