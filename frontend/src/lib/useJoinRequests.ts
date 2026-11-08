import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { keys, myRequests } from '../api/households'
import type { JoinOutcome, PendingRequest } from '../api/types'

/** While a request waits, asked again this often, with the page in front (specs/015, FR-007). */
export const WAITING_CHECK_MS = 10_000

/**
 * The person's requests to join and how they ended (specs/015-invite-preview). While at least one
 * waits, it asks again every 10 seconds; never while the tab is in the background, and once at once
 * when it comes back (TanStack Query's defaults); never two checks at once. Each check tells a request
 * approved (it is among the houses joined), refused or gone (an outcome), or cancelled (neither):
 * `onApproved` hears of each approval once.
 */
export function useJoinRequests(onApproved: (request: PendingRequest) => void) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: keys.myRequests,
    queryFn: myRequests,
    refetchInterval: (q) => (q.state.data?.pending.length ? WAITING_CHECK_MS : false),
    refetchIntervalInBackground: false,
    retry: false,
  })
  const waiting = useRef(new Map<number, PendingRequest>())
  const approved = useRef(onApproved)
  useEffect(() => {
    approved.current = onApproved
  })

  const data = query.data
  useEffect(() => {
    if (!data) return
    const before = waiting.current
    const now = new Map(data.pending.map((r) => [r.household_id, r]))
    for (const [id, request] of before) {
      if (now.has(id)) continue
      if (data.joined.includes(id)) {
        approved.current(request)
        // The house shows in the list: loaded once, now
        void queryClient.invalidateQueries({ queryKey: keys.households, exact: true })
      }
    }
    waiting.current = now
  }, [data, queryClient])

  return {
    pending: data?.pending,
    outcomes: data?.outcomes ?? ([] as JoinOutcome[]),
    joined: data?.joined ?? [],
    checking: query.isFetching,
    check: () => void query.refetch(),
  }
}
