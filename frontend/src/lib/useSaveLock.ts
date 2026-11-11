import type { KeyboardEvent, MouseEvent } from 'react'

// Keys that would change a choice (a radio's arrows, a box's space) while a save is on its way
const CHOICE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar'])

// Opening or closing a fold changes nothing that is saved, so it stays possible
const isFree = (target: EventTarget) => target instanceof Element && target.closest('[aria-expanded], [data-lock-free]') !== null

function blockClick(event: MouseEvent) {
  if (isFree(event.target)) return
  event.preventDefault()
  event.stopPropagation()
}

function blockChoiceKey(event: KeyboardEvent) {
  const target = event.target
  if (!(target instanceof HTMLInputElement) || (target.type !== 'radio' && target.type !== 'checkbox')) return
  if (!CHOICE_KEYS.has(event.key)) return
  event.preventDefault()
  event.stopPropagation()
}

/**
 * What a money form puts on its parts while its save is on its way, so what is being saved cannot change
 * underneath (specs/018, FR-007, research R5). Nothing is natively disabled: a disabled control that has
 * the focus throws it to the page body (FR-011, the lesson of #248). Text stays readable and selectable.
 */
export function useSaveLock(locked: boolean) {
  return {
    locked,
    /** On the <form>: says it is busy, and stops every press inside it except fold toggles. */
    form: {
      'aria-busy': locked || undefined,
      'data-locked': locked || undefined,
      onClickCapture: locked ? blockClick : undefined,
      onKeyDownCapture: locked ? blockChoiceKey : undefined,
    },
    /** On a text, amount or date field. */
    text: { readOnly: locked || undefined, 'aria-readonly': locked || undefined },
    /** On a radio, a checkbox or a picker button. */
    choice: { 'aria-disabled': locked || undefined },
  }
}
