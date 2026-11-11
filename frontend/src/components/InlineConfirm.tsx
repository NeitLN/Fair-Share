import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

import { useT } from '../i18n'

interface InlineConfirmProps {
  /** The button that asks, e.g. "Xoá". */
  label: ReactNode
  /** Its accessible name when the label alone is not enough ("Xoá Đi chợ"). */
  ariaLabel?: string
  /** The trigger's class; the quiet `btn-ghost` unless given. */
  className?: string
  /** Asked in place of the button: "Xoá khoản "Đi chợ"?". */
  question: string
  /** The button that does it, in the question ("Xoá"). */
  confirmLabel: string
  onConfirm: () => void
  /** The action is running: the trigger shows `busyLabel` and cannot be pressed. */
  busy?: boolean
  busyLabel?: ReactNode
  disabled?: boolean
  /** A hint read with the button (`aria-describedby`). */
  describedBy?: string
}

/**
 * One way to confirm an action that changes something for everyone (plan item 8: delete an expense, stop
 * a recurring one, a new invite code, remove a photo): the button turns into its question, in place, with
 * the action and Huỷ. Never the browser's own dialog, which phones show out of context and nobody reads.
 *
 * The focus moves to the action when the question opens, and back to the button when it closes (Huỷ,
 * Escape, or done). Escape closes the question only, not the fold or dialog it sits in.
 */
function InlineConfirm({
  label,
  ariaLabel,
  className = 'btn-ghost',
  question,
  confirmLabel,
  onConfirm,
  busy = false,
  busyLabel,
  disabled = false,
  describedBy,
}: InlineConfirmProps) {
  const t = useT()
  const id = useId()
  const [asking, setAsking] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const action = useRef<HTMLButtonElement>(null)
  // Where the focus goes after the next render: the action once asked, the button once answered
  const focusNext = useRef<'action' | 'trigger' | null>(null)
  useEffect(() => {
    const next = focusNext.current
    if (!next) return
    focusNext.current = null
    ;(next === 'action' ? action : trigger).current?.focus()
  })

  const close = () => {
    focusNext.current = 'trigger'
    setAsking(false)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    close()
  }

  if (asking) {
    return (
      <span className="inline-confirm" role="group" aria-labelledby={`${id}-question`} onKeyDown={onKeyDown}>
        <span id={`${id}-question`} className="inline-confirm-question">
          {question}
        </span>
        <button
          ref={action}
          type="button"
          className="btn-danger-solid"
          onClick={() => {
            close()
            onConfirm()
          }}
        >
          {confirmLabel}
        </button>
        <button type="button" className="btn-ghost" onClick={close}>
          {t.common.cancel}
        </button>
      </span>
    )
  }
  return (
    <button
      ref={trigger}
      type="button"
      className={className}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      // Not `disabled`: the button keeps the focus it got back after the question while the action runs
      // ("Đổi mã mới" stays in place; review of #300). A press meanwhile does nothing
      aria-disabled={disabled || busy || undefined}
      onClick={() => {
        if (disabled || busy) return
        focusNext.current = 'action'
        setAsking(true)
      }}
    >
      {busy && busyLabel ? busyLabel : label}
    </button>
  )
}

export default InlineConfirm
