import type { KeyboardEvent } from 'react'

/**
 * DESIGN.md §8: Escape closes an open fold. For a `<details>` fold: closes it, puts the focus back on
 * its summary (so the keyboard user is not left on a control that just disappeared), and returns true.
 * Does nothing for other keys or a fold that is already closed.
 */
export function closeFoldOnEscape(event: KeyboardEvent<HTMLDetailsElement>): boolean {
  const fold = event.currentTarget
  if (event.key !== 'Escape' || !fold.open) return false
  event.preventDefault()
  // The fold is handled; an outer listener (a chooser, a dialog) must not close as well
  event.stopPropagation()
  fold.open = false
  fold.querySelector<HTMLElement>(':scope > summary')?.focus()
  return true
}
