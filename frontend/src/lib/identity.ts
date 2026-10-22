import { createContext, useContext } from 'react'

/**
 * "Bạn là ai?" (PROJECT_SPEC UX-01, DESIGN.md §6.2): which member is using this device, per household.
 * Stored only in this browser, never sent to the server. One <IdentityProvider> per household frame
 * owns it (components/IdentityProvider.tsx), so every page under it sees a change at once.
 */

export const identityKey = (householdId: number) => `fair-share:me:${householdId}`

export function readMe(householdId: number): number | null {
  try {
    const saved = Number(localStorage.getItem(identityKey(householdId)))
    return Number.isInteger(saved) && saved > 0 ? saved : null
  } catch {
    return null
  }
}

export function writeMe(householdId: number, memberId: number | null): void {
  try {
    if (memberId === null) localStorage.removeItem(identityKey(householdId))
    else localStorage.setItem(identityKey(householdId), String(memberId))
  } catch {
    // Storage blocked: the choice lasts for this visit only
  }
}

/**
 * The payer of the last expense saved on this device, per household: the default payer when nobody has
 * said who they are (DESIGN.md §6.3). Like the identity, it stays in this browser.
 */
export const lastPayerKey = (householdId: number) => `fair-share:last-payer:${householdId}`

export function readLastPayer(householdId: number): number | null {
  try {
    const saved = Number(localStorage.getItem(lastPayerKey(householdId)))
    return Number.isInteger(saved) && saved > 0 ? saved : null
  } catch {
    return null
  }
}

export function writeLastPayer(householdId: number, memberId: number): void {
  try {
    localStorage.setItem(lastPayerKey(householdId), String(memberId))
  } catch {
    // Storage blocked: the next expense simply has no default payer
  }
}

export interface Identity {
  /** The member using this device, or null when not chosen (or no longer in the household). */
  me: number | null
  setMe: (memberId: number | null) => void
}

export const IdentityContext = createContext<Identity>({ me: null, setMe: () => {} })

/** The current choice for the household around this component; outside one, nobody is chosen. */
export function useMe(): Identity {
  return useContext(IdentityContext)
}
