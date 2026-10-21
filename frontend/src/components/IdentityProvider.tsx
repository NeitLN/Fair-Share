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
  // The stored choice for whichever household is shown; read again when the household changes
  const [state, setState] = useState(() => ({ householdId, me: readMe(householdId) }))
  const current = state.householdId === householdId ? state.me : readMe(householdId)
  if (state.householdId !== householdId) setState({ householdId, me: current })

  // Only a loaded member list can prove the choice wrong (someone removed): never while loading
  const known = members === undefined || current === null || members.some((m) => m.id === current)
  const me = known ? current : null

  useEffect(() => {
    if (!known) writeMe(householdId, null)
  }, [known, householdId])

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
