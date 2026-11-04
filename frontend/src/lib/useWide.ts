import { useSyncExternalStore } from 'react'

// A computer's screen (DESIGN.md §6.6). Where it changes what is on the page and in what order, the
// page asks this instead of moving things with CSS, so the keyboard order is always the one on screen.
const WIDE = '(min-width: 1024px)'

const media = () => (typeof window.matchMedia === 'function' ? window.matchMedia(WIDE) : null)

function subscribe(onChange: () => void) {
  const query = media()
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

/** True on a screen 1024 px wide or more; false where the browser cannot say (the phone layout). */
export function useWide(): boolean {
  return useSyncExternalStore(subscribe, () => media()?.matches ?? false, () => false)
}
