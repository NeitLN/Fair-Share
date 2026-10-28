/**
 * The households this browser may open, with their keys (#132). A household can only be read or
 * changed with its secret key (app/access.py), which arrives once: in the answer to creating it, or in
 * an invite link (`/households/12#k=…`). The home page lists the households kept here, most recently
 * created or opened first. Kept in this browser only, like "Bạn là ai?" (lib/identity.ts).
 */

export const KNOWN_KEY = 'fair-share:households'
export const KEYS_KEY = 'fair-share:household-keys'

const valid = (id: unknown): id is number => Number.isInteger(id) && (id as number) > 0

// What the browser refused to store (private window, storage blocked or full): kept in memory, so a
// household just created or opened still works for this visit. A later write that succeeds saves it.
const unsaved = new Map<string, string>()

/** False when something could not be stored on this device and will be lost on reload. */
export const savedOnThisDevice = () => unsaved.size === 0

function load<T>(storageKey: string, fallback: T): T {
  let saved = unsaved.get(storageKey) ?? null
  if (saved === null) {
    try {
      saved = localStorage.getItem(storageKey)
    } catch {
      saved = null
    }
  }
  try {
    return saved === null ? fallback : (JSON.parse(saved) as T)
  } catch {
    return fallback
  }
}

function save(storageKey: string, value: unknown): void {
  const text = JSON.stringify(value)
  try {
    localStorage.setItem(storageKey, text)
    unsaved.delete(storageKey)
  } catch {
    unsaved.set(storageKey, text)
  }
}

function keys(): Record<string, string> {
  const saved = load<unknown>(KEYS_KEY, {})
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? (saved as Record<string, string>) : {}
}

/** The key this browser holds for a household, if any. */
export function keyFor(householdId: number): string | null {
  const key = keys()[String(householdId)]
  return typeof key === 'string' && key.length > 0 ? key : null
}

/**
 * The households this browser can open, most recent first. A household without a key here (one
 * saved before keys existed) cannot be opened any more, so it is not listed.
 */
export function readKnown(): number[] {
  const saved = load<unknown>(KNOWN_KEY, [])
  const ids = Array.isArray(saved) ? [...new Set(saved.filter(valid))] : []
  return ids.filter((id) => keyFor(id) !== null)
}

// The key an invite link replaced, per household, until the API has said whether the new one works
const replaced = new Map<number, string>()
// Keys the API refused in this visit, so a wrong link still in the address bar is not tried again
const refused = new Set<string>()

/** Drops what this visit kept in memory, as a page reload would (tests start each case from here). */
export function resetVisit(): void {
  unsaved.clear()
  replaced.clear()
  refused.clear()
}

/** Whether the API already refused this key for this household during this visit. */
export const wasRefused = (householdId: number, key: string) => refused.has(`${householdId}:${key}`)

/** Created or opened here: its key is kept, and it goes first in the list. */
export function remember(householdId: number, key?: string | null): void {
  if (!valid(householdId)) return
  if (key) {
    const held = keyFor(householdId)
    if (held && held !== key) replaced.set(householdId, held)
    save(KEYS_KEY, { ...keys(), [String(householdId)]: key })
  }
  if (keyFor(householdId) === null) return
  const ids = readKnown()
  if (ids[0] === householdId) return
  save(KNOWN_KEY, [householdId, ...ids.filter((id) => id !== householdId)])
}

/** The household opened with its current key: a key it replaced is not needed any more. */
export function keyWorks(householdId: number): void {
  replaced.delete(householdId)
}

/**
 * The current key does not open the household. If an invite link had replaced a key this browser
 * held, that key comes back and true is returned: the link was wrong, not the household gone.
 */
export function restoreReplacedKey(householdId: number): boolean {
  // Not tried again in this visit, even if the link is still in the address bar
  refused.add(`${householdId}:${keyFor(householdId)}`)
  const previous = replaced.get(householdId)
  replaced.delete(householdId)
  if (!previous) return false
  save(KEYS_KEY, { ...keys(), [String(householdId)]: previous })
  return true
}

export interface Forgotten {
  /** Where it was in the list (−1: it was not there). */
  at: number
  key: string | null
}

/**
 * Off this browser: out of the list and its key gone, so opening it again needs the invite link.
 * The household and its data are not touched.
 */
export function forget(householdId: number): Forgotten {
  replaced.delete(householdId)
  const ids = readKnown()
  const forgotten = { at: ids.indexOf(householdId), key: keyFor(householdId) }
  save(KNOWN_KEY, ids.filter((id) => id !== householdId))
  const { [String(householdId)]: _dropped, ...rest } = keys()
  save(KEYS_KEY, rest)
  return forgotten
}

/** Undo forget(): key back, and back where it was in the list. */
export function putBack(householdId: number, { at, key }: Forgotten): void {
  if (!valid(householdId) || !key) return
  save(KEYS_KEY, { ...keys(), [String(householdId)]: key })
  const ids = readKnown().filter((id) => id !== householdId)
  ids.splice(Math.max(0, Math.min(at < 0 ? 0 : at, ids.length)), 0, householdId)
  save(KNOWN_KEY, ids)
}

/** `#k=…` of an invite link, or null. */
export function keyFromHash(hash: string): string | null {
  const key = new URLSearchParams(hash.replace(/^#/, '')).get('k')
  return key && /^[0-9a-f]{32,}$/i.test(key) ? key : null
}

/** The link that lets a housemate open this household: the key travels after `#`, never to a server. */
export function inviteLink(householdId: number): string | null {
  const key = keyFor(householdId)
  return key ? `${window.location.origin}/households/${householdId}#k=${key}` : null
}
