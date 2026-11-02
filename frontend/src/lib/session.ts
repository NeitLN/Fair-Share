import { useSyncExternalStore } from 'react'

import type { Session } from '../api/types'

/**
 * Who is signed in on this browser (docs/ACCOUNTS.md): the session token the API gave at login and
 * the account it belongs to. Kept in localStorage so a reload stays signed in; when storage is
 * blocked (some private windows) it lasts for this visit only. The token goes in the Authorization
 * header of every request (api/client.ts), never in a cookie or a URL.
 */

export const SESSION_KEY = 'fair-share:session'

let current: Session | null = read()
const listeners = new Set<() => void>()

function read(): Session | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')
    return saved && typeof saved.token === 'string' && saved.user ? (saved as Session) : null
  } catch {
    return null
  }
}

function set(session: Session | null) {
  current = session
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // Storage blocked: signed in until the tab closes
  }
  listeners.forEach((listener) => listener())
}

export const signIn = (session: Session) => set(session)

/** Forgets the session on this browser (after logout, or when the API no longer accepts it). */
export const signOut = () => set(null)

export const currentSession = () => current

export function useSession(): Session | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}

/** Tests start each case from what localStorage holds, as a new page load would. */
export function reloadSession() {
  current = read()
  listeners.forEach((listener) => listener())
}
