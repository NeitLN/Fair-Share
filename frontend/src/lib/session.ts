import { useSyncExternalStore } from 'react'

import type { Session } from '../api/types'
import { forgetAllKept } from './keptDraft'

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

// The session ended without the person signing out here: the API stopped accepting it (a 401: signed
// out elsewhere, a password change, or too old), or another tab signed out. The sign-in page says so
// (review 12/11, E10/F16). Kept for the tab, so a reload on the sign-in page still says it.
const ENDED_KEY = 'fair-share:session-ended'
let ended = readEnded()

function readEnded(): boolean {
  try {
    return sessionStorage.getItem(ENDED_KEY) === '1'
  } catch {
    return false
  }
}

function markEnded(value: boolean) {
  ended = value
  try {
    if (value) sessionStorage.setItem(ENDED_KEY, '1')
    else sessionStorage.removeItem(ENDED_KEY)
  } catch {
    // Storage blocked: said until the tab reloads
  }
}

export const signIn = (session: Session) => {
  markEnded(false)
  set(session)
}

/** The same session with the account's new details (a rename on the profile page). */
export const updateUser = (user: Session['user']) => {
  if (current) set({ ...current, user })
}

/**
 * Forgets the session on this browser: after logout, or with `'ended'` when the API no longer accepts it,
 * which the sign-in page then explains.
 */
export const signOut = (reason?: 'ended') => {
  if (reason === 'ended' && current) markEnded(true)
  // Signing out on purpose leaves nothing typed behind; an ended session keeps it for the sign-in again
  else forgetAllKept()
  set(null)
}

/** Whether the last session ended on its own (not by Đăng xuất here); cleared by the next sign-in. */
export const sessionEnded = () => ended

// Another tab of this browser signed in or out: this one follows at once, instead of failing its next
// save with a 401 and losing what was typed (E10)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== SESSION_KEY && event.key !== null) return
    const before = current
    current = read()
    if (before && !current) markEnded(true)
    listeners.forEach((listener) => listener())
  })
}

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
  ended = readEnded()
  listeners.forEach((listener) => listener())
}
