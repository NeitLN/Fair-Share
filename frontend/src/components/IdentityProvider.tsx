import { useMemo } from 'react'
import type { ReactNode } from 'react'

import { IdentityContext } from '../lib/identity'

interface IdentityProviderProps {
  /** The signed-in user's name in this household's split (from the API), null until it is loaded. */
  me: number | null
  children: ReactNode
}

/** "Bạn" in every page of one household: the name the user's account has there (docs/ACCOUNTS.md). */
export function IdentityProvider({ me, children }: IdentityProviderProps) {
  const value = useMemo(() => ({ me, setMe: () => {} }), [me])
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
}
