import { useSyncExternalStore } from 'react'

/**
 * Which API requests have waited too long (specs/011-first-impressions, FR-007 to FR-009). The free
 * server sleeps after about 15 minutes and takes about 50 s to wake, so a first request can hang with
 * nothing on screen to explain it. request() calls begin() before each fetch and end() once its answer
 * has been read, whatever the outcome; the notice shows while any of them has waited more than 5 s.
 */

export const SLOW_AFTER_MS = 5_000
/** Hidden this long, the next showing is a new episode and is announced again. */
export const QUIET_MS = 10_000

export interface SlowState {
  /** At least one request has waited more than SLOW_AFTER_MS. */
  slow: boolean
  /** This showing starts a new episode, so screen readers hear it (once). */
  announce: boolean
}

const timers = new Map<number, ReturnType<typeof setTimeout>>()
const slowTokens = new Set<number>()
let nextToken = 1
/** When the notice last hid; null while it has never shown. */
let hiddenAt: number | null = null
let state: SlowState = { slow: false, announce: false }
const listeners = new Set<() => void>()

function publish() {
  const slow = slowTokens.size > 0
  if (slow === state.slow) return
  if (slow) {
    // A new episode unless the notice hid less than QUIET_MS ago
    state = { slow: true, announce: hiddenAt === null || Date.now() - hiddenAt >= QUIET_MS }
  } else {
    hiddenAt = Date.now()
    state = { slow: false, announce: false }
  }
  listeners.forEach((listener) => listener())
}

/** A request starts: returns its token, marked slow if it is still waiting after SLOW_AFTER_MS. */
export function beginRequest(): number {
  const token = nextToken++
  timers.set(
    token,
    setTimeout(() => {
      timers.delete(token)
      slowTokens.add(token)
      publish()
    }, SLOW_AFTER_MS),
  )
  return token
}

/** The request's answer has been read, or it failed or was cancelled. */
export function endRequest(token: number) {
  clearTimeout(timers.get(token))
  timers.delete(token)
  if (slowTokens.delete(token)) publish()
}

/** The state outside React (tests of request()). */
export const slowState = (): SlowState => state

export function useSlowRequests(): SlowState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

/** Tests only: forget every request and episode. */
export function resetSlowRequests() {
  timers.forEach((timer) => clearTimeout(timer))
  timers.clear()
  slowTokens.clear()
  hiddenAt = null
  state = { slow: false, announce: false }
  listeners.forEach((listener) => listener())
}
