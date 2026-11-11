import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { formatVND } from '../lib/money'
import { parseAmount } from '../lib/split'
import { useVisibleSaveError } from '../lib/toast'
import { useSaveLock } from '../lib/useSaveLock'
import { useT } from '../i18n'

interface NoticeAmountStepProps {
  /** The field's label: "Số tiền đã nhận". */
  label: string
  /** The amount it starts at. */
  initial: number
  /** The largest amount allowed, with its own message. */
  max: number
  maxMessage: (amount: string) => string
  /** A line under the field, e.g. "Tối đa 100.000đ, số đã báo." */
  hint?: string
  submitLabel: string
  busy: boolean
  /** Also a note (one line, 120 characters), sent with the amount: the payer's steps. */
  withNote?: boolean
  /** A line that follows what is typed, e.g. "60.000đ + 40.000đ = 100.000đ" ("Báo thêm"). */
  sumLine?: (amount: number) => string
  /** The server refused the last send (409): said under the field, what was typed stays. */
  serverProblem?: string | null
  onSubmit: (amount: number, note?: string) => void
  /** Closes the step; the opener gets the focus back. */
  onCancel: () => void
  /** What the send button says while it is sent: "Đang báo…" for the payer (specs/019, FR-017). */
  busyLabel?: string
  /**
   * Above `max`, a way to the right amount instead of only a refusal (specs/019, US5): the line to show
   * and a button that fills `amount`. Left out when the 10^12 limit is what binds.
   */
  fill?: { amount: number; line: string; label: string }
}

/**
 * An amount, typed like the expense form ("1tr", "500k"), with "= …đ" under it (specs/014). Enter sends,
 * Escape closes. What was typed stays when the server refuses it.
 */
function NoticeAmountStep({
  label,
  initial,
  max,
  maxMessage,
  hint,
  submitLabel,
  busy,
  withNote = false,
  sumLine,
  serverProblem = null,
  busyLabel,
  fill,
  onSubmit,
  onCancel,
}: NoticeAmountStepProps) {
  const t = useT()
  const id = useId()
  const field = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(String(initial))
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  // Too much typed, with a right amount to offer (specs/019, FR-021)
  const [offer, setOffer] = useState(false)
  const amount = parseAmount(text)
  const shownProblem = problem ?? serverProblem
  // While it is being sent the step cannot change or close (specs/018, FR-007, FR-009)
  const lock = useSaveLock(busy)
  // While a problem shows here, no "saved" toast stands beside it (specs/018, FR-012)
  useVisibleSaveError(shownProblem, () => field.current)

  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const found = !text.trim()
      ? t.form.amountEmpty
      : amount === null || amount <= 0
        ? t.settlements.badAmount
        : amount > max
          ? (fill?.line ?? maxMessage(formatVND(max)))
          : null
    setProblem(found)
    setOffer(found !== null && amount !== null && amount > max && fill !== undefined)
    if (found) {
      field.current?.focus()
      return
    }
    onSubmit(amount as number, withNote ? note : undefined)
  }

  return (
    <form
      className="notice-step"
      onSubmit={submit}
      noValidate
      {...lock.form}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        if (!busy) onCancel()
      }}
    >
      <label htmlFor={`${id}-amount`}>{label}</label>
      <input
        ref={field}
        id={`${id}-amount`}
        type="text"
        inputMode="numeric"
        value={text}
        {...lock.text}
        aria-invalid={shownProblem ? true : undefined}
        aria-describedby={[`${id}-echo`, sumLine && `${id}-sum`, hint && `${id}-hint`, shownProblem && `${id}-problem`]
          .filter(Boolean)
          .join(' ')}
        onChange={(e) => {
          setText(e.target.value)
          setProblem(null)
          setOffer(false)
        }}
      />
      <span id={`${id}-echo`} className="amount-preview">
        {amount !== null && amount > 0 ? `= ${formatVND(amount)}` : ''}
      </span>
      {sumLine && (
        <span id={`${id}-sum`} className="notice-sum">
          {amount !== null && amount > 0 ? sumLine(amount) : ''}
        </span>
      )}
      {hint && (
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
      )}
      {shownProblem && (
        <p id={`${id}-problem`} className="field-problem">
          {shownProblem}
        </p>
      )}
      {offer && fill && !busy && (
        <button
          type="button"
          className="btn-secondary"
          data-action="fill-exact"
          onClick={() => {
            setText(String(fill.amount))
            setProblem(null)
            setOffer(false)
            field.current?.focus()
          }}
        >
          {fill.label}
        </button>
      )}
      {withNote && (
        <>
          <label htmlFor={`${id}-note`}>{t.verdict.noteLabel}</label>
          <input
            id={`${id}-note`}
            type="text"
            maxLength={120}
            value={note}
            {...lock.text}
            onChange={(e) => setNote(e.target.value)}
          />
        </>
      )}
      <span className="notice-step-buttons">
        <button type="submit" className="btn-secondary" aria-disabled={busy || undefined}>
          {busy ? (busyLabel ?? t.verdict.paying) : submitLabel}
        </button>
        <button type="button" className="btn-ghost" aria-disabled={busy || undefined} onClick={() => !busy && onCancel()}>
          {t.common.cancel}
        </button>
      </span>
    </form>
  )
}

export default NoticeAmountStep
