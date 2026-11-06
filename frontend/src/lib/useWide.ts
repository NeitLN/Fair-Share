import { useSyncExternalStore } from 'react'

// A computer's screen (DESIGN.md §6.6). Where it changes what is on the page and in what order, the
// page asks this instead of moving things with CSS, so the keyboard order is always the one on screen.
const WIDE = '(min-width: 1024px)'
// From 1408 px the expense table shows its date and payer columns; below, they fold under the description.
// 1408 = 1280 × 1.1: signed-in pages are shown at 110 % on a computer (index.css), so a 1366 px laptop
// has the room of a 1242 px one
const WIDE_TABLE = '(min-width: 1408px)'

function watch(query: string) {
  const media = () => (typeof window.matchMedia === 'function' ? window.matchMedia(query) : null)
  const subscribe = (onChange: () => void) => {
    const list = media()
    list?.addEventListener('change', onChange)
    return () => list?.removeEventListener('change', onChange)
  }
  return { subscribe, matches: () => media()?.matches ?? false }
}

const wide = watch(WIDE)
const wideTable = watch(WIDE_TABLE)

/** True on a screen 1024 px wide or more; false where the browser cannot say (the phone layout). */
export function useWide(): boolean {
  return useSyncExternalStore(wide.subscribe, wide.matches, () => false)
}

/** True from 1408 px, where the expense table has all five columns. */
export function useWideTable(): boolean {
  return useSyncExternalStore(wideTable.subscribe, wideTable.matches, () => false)
}
