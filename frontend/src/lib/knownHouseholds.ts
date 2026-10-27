/**
 * The households this browser knows: the ones created or opened here (#132). The home page lists only
 * these; the API has no list of every household any more. Kept in this browser only, like "Bạn là ai?"
 * (lib/identity.ts). Most recently created or opened first.
 */

export const KNOWN_KEY = 'fair-share:households'

const valid = (id: unknown): id is number => Number.isInteger(id) && (id as number) > 0

function write(ids: number[]): void {
  try {
    localStorage.setItem(KNOWN_KEY, JSON.stringify(ids))
  } catch {
    // Storage blocked: the list lasts for this visit only
  }
}

/**
 * Households this browser used before the list existed: wherever it chose "Bạn là ai?" or saved an
 * expense (identity.ts keeps both per household). Read once, the first time, so nobody's home page
 * turns up empty after the update.
 */
function fromEarlierVisits(): number[] {
  const ids = new Set<number>()
  for (let i = 0; i < localStorage.length; i++) {
    const match = /^fair-share:(?:me|last-payer):(\d+)$/.exec(localStorage.key(i) ?? '')
    if (match) ids.add(Number(match[1]))
  }
  return [...ids].sort((a, b) => b - a)
}

export function readKnown(): number[] {
  try {
    const saved = localStorage.getItem(KNOWN_KEY)
    if (saved === null) {
      const earlier = fromEarlierVisits()
      write(earlier)
      return earlier
    }
    const parsed: unknown = JSON.parse(saved)
    return Array.isArray(parsed) ? [...new Set(parsed.filter(valid))] : []
  } catch {
    return []
  }
}

/** Created or opened here: first in the list. */
export function remember(householdId: number): void {
  if (!valid(householdId)) return
  const ids = readKnown()
  if (ids[0] === householdId) return
  write([householdId, ...ids.filter((id) => id !== householdId)])
}

/** Off this browser's list; the household and its data are not touched. Returns where it was (−1: not there). */
export function forget(householdId: number): number {
  const ids = readKnown()
  const at = ids.indexOf(householdId)
  if (at !== -1) write(ids.filter((id) => id !== householdId))
  return at
}

/** Undo forget(): back where it was. */
export function putBack(householdId: number, at: number): void {
  if (!valid(householdId)) return
  const ids = readKnown().filter((id) => id !== householdId)
  ids.splice(Math.max(0, Math.min(at, ids.length)), 0, householdId)
  write(ids)
}
