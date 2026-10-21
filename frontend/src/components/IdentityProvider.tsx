import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import type { Member } from '../api/types'
import { IdentityContext, readMe, writeMe } from '../lib/identity'

interface IdentityProviderProps {
  householdId: number
  /** The household's members once loaded; undefined while loading or after a failed load. */
  members: Member[] | undefined
  children: ReactNode
}

export function IdentityProvider({ householdId, members, children }: IdentityProviderProps) {
  const [state, setState] = useState(() => ({ householdId, me: readMe(householdId) }))

  // Adjusted while rendering, so no render ever shows a stale value:
  // another household → read its own choice; a loaded member list that does not contain the choice
  // (someone removed) → forget it in memory too, so a later reload cannot bring it back. A list that is
  // still loading, or failed to load, proves nothing and keeps the choice.
  let next = state.householdId === householdId ? state : { householdId, me: readMe(householdId) }
  if (members !== undefined && next.me !== null && !members.some((m) => m.id === next.me)) {
    next = { householdId, me: null }
  }
  if (next !== state) setState(next)
  const me = next.me

  // Storage follows: drop a saved choice the loaded members disprove (the external system only)
  useEffect(() => {
    if (me !== null || members === undefined) return
    const saved = readMe(householdId)
    if (saved !== null && !members.some((m) => m.id === saved)) writeMe(householdId, null)
  }, [me, members, householdId])

  const setMe = useCallback(
    (memberId: number | null) => {
      writeMe(householdId, memberId)
      setState({ householdId, me: memberId })
    },
    [householdId],
  )

  const value = useMemo(() => ({ me, setMe }), [me, setMe])
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
}
