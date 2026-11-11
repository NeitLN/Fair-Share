import { MutationCache, QueryClient } from '@tanstack/react-query'

import { ApiError } from './client'
import { keys } from './households'

declare module '@tanstack/react-query' {
  interface Register {
    /** A money write names its household, so a "result unknown" can refresh it (specs/018, FR-006). */
    mutationMeta: { householdId?: number }
  }
}

/**
 * After a write whose result is unknown, the household is read again now and twice more: the server may
 * commit after the first read (specs/018, FR-006, SC-007).
 */
export const UNKNOWN_REFRESH_MS = [0, 10_000, 30_000] as const

/** Reads `householdId` again now, after 10 s and after 30 s when `error` left a write's result unknown. */
export function refreshIfUnknown(error: unknown, householdId: number | undefined) {
  if (!(error instanceof ApiError) || error.code !== 'outcome_unknown' || typeof householdId !== 'number') return
  for (const delay of UNKNOWN_REFRESH_MS) {
    setTimeout(() => void queryClient.invalidateQueries({ queryKey: keys.household(householdId) }), delay)
  }
}

export const queryClient: QueryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => refreshIfUnknown(error, mutation.meta?.householdId),
  }),
  defaultOptions: {
    queries: {
      // A 4xx will fail again the same way; only retry once when the server or network hiccups
      retry: (failureCount, error) =>
        failureCount < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
    // A write is sent when it is pressed, or not at all: never paused while offline and resumed later,
    // never retried behind the person's back (specs/018, FR-001, research R3)
    mutations: { networkMode: 'always', retry: 0 },
  },
})
