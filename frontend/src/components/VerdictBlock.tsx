import { useEffect, useId, useRef, useState } from 'react'

import type { Transfer } from '../api/types'
import { REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import type { FocusIntent, TransferCard } from '../lib/usePaidTransfers'
import { transferText, verdict } from '../lib/verdict'
import { Avatar } from './Avatar'
import { Stamp } from './Chip'
import { Money } from './Money'
import { useT } from '../i18n'

interface VerdictBlockProps {
  /** The month the first line talks about, 1–12. */
  month: number
  /** What the household spent this month; null while it is unknown (the line then names only the month). */
  spent: number | null
  /** The expenses could not be loaded, so this month's total is unknown. */
  spentUnavailable?: boolean
  /** The suggested transfers, in the order the API gives them: the sentence and the reminder. */
  suggested: Transfer[]
  /** The cards to show: the suggestions plus the transfers just recorded (lib/usePaidTransfers.ts). */
  cards: TransferCard[]
  /** The member using this device ("Bạn là ai?"), or null. */
  me: number | null
  looks: Map<number, MemberLook>
  /** Somebody in the household has spent or paid something (a new household is not "sạch nợ"). */
  started: boolean
  /** The balances are loading, or could not be loaded (with a retry). */
  loading?: boolean
  loadError?: string | null
  /** Refreshing failed: what is shown is the last known state, with a retry. */
  refreshError?: string | null
  onRetry?: () => void
  onPaid: (transfer: Transfer) => void
  onUndo: (paymentId: number) => void
  /** A focus move asked for by the last Đã trả or Hoàn tác, and how to say it is done. */
  focusIntent?: () => FocusIntent | null
  onFocusDone?: () => void
  /** Recording a transfer failed. */
  error?: string | null
  /** The text "Sao chép tin nhắn nhắc nợ" copies; only offered while there is something to settle. */
  reminder: string
  /** The reminder is on the clipboard (the page says so in a toast). */
  onCopied: () => void
}

/**
 * The taro block at the top of Tổng quan (DESIGN.md §6.2): one sentence about you, the total, the
 * transfers that settle everyone, and the reminder for the household's group chat. Props only; the page
 * records the transfers.
 */
function VerdictBlock({
  month,
  spent,
  spentUnavailable = false,
  suggested,
  cards,
  me,
  looks,
  started,
  loading = false,
  loadError = null,
  refreshError = null,
  onRetry,
  onPaid,
  onUndo,
  focusIntent,
  onFocusDone,
  error = null,
  reminder,
  onCopied,
}: VerdictBlockProps) {
  const t = useT()
  const id = useId()
  const [showText, setShowText] = useState(false)
  const fallback = useRef<HTMLTextAreaElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const lookOf = (memberId: number) => looks.get(memberId) ?? REMOVED_MEMBER
  const nameOf = (memberId: number) => lookOf(memberId).short

  // Copying failed: the text is shown instead, focused and selected so it can be copied by hand
  function selectFallback() {
    fallback.current?.focus()
    fallback.current?.select()
  }
  useEffect(() => {
    if (showText) selectFallback()
  }, [showText])

  // Keyboard focus follows a press when the pressed button goes away with its card: Đã trả → that
  // card's Hoàn tác once it is recorded; Hoàn tác (on the card or in the toast) → the block's heading
  // once the card is gone, or back to Hoàn tác if undoing failed. Never taken from where the user put it.
  useEffect(() => {
    const wanted = focusIntent?.()
    if (!wanted) return
    const lost = () => !document.activeElement || document.activeElement === document.body
    const card = list.current?.querySelector(`[data-card="${wanted.card}"]`)
    if (!card) {
      // Gone: undone (focus the heading), or a failed Đã trả whose card left (nothing to follow)
      if (wanted.then === 'gone' && lost()) heading.current?.focus()
      onFocusDone?.()
      return
    }
    const undo = card.querySelector<HTMLButtonElement>('button[data-action="undo"]:not(:disabled)')
    if (!undo) return
    if (lost()) undo.focus()
    onFocusDone?.()
  })

  async function copy() {
    try {
      await navigator.clipboard.writeText(reminder)
      setShowText(false)
      onCopied()
    } catch {
      // No clipboard (an old browser, or the page not on https) or permission refused. Already shown
      // after an earlier failure: take the user back to it.
      if (showText) selectFallback()
      else setShowText(true)
    }
  }

  const monthLine = (
    <p className="verdict-month">
      {t.verdict.month(month)}
      {spent !== null && (
        <>
          {' '}
          · {t.verdict.spent} <Money amount={spent} />
        </>
      )}
      {spent === null && spentUnavailable && t.verdict.spentUnavailable}
    </p>
  )

  if (loading || loadError) {
    return (
      <section className="verdict" aria-labelledby={`${id}-title`} aria-busy={loading || undefined}>
        {monthLine}
        <h2 id={`${id}-title`} className="verdict-sentence">
          {loading ? t.verdict.working : t.verdict.failed}
        </h2>
        {loadError && (
          <div className="note" role="alert">
            {loadError}
            {onRetry && (
              <button type="button" className="btn-secondary" onClick={onRetry}>
                {t.common.tryAgain}
              </button>
            )}
          </div>
        )}
      </section>
    )
  }

  const { sentence, total } = verdict(suggested, me, nameOf, started)

  return (
    <section className="verdict" aria-labelledby={`${id}-title`}>
      {monthLine}
      <h2 id={`${id}-title`} ref={heading} className="verdict-sentence" tabIndex={-1}>
        {sentence}
      </h2>
      {total !== null && (
        <p className="verdict-total">
          <Money amount={total} />
        </p>
      )}
      {refreshError && (
        <div className="note" role="alert">
          {t.verdict.stale} {refreshError}
          {onRetry && (
            <button type="button" className="btn-secondary" onClick={onRetry}>
              {t.common.tryAgain}
            </button>
          )}
        </div>
      )}

      {cards.length > 0 && (
        <ul ref={list} className="transfer-list" aria-label={t.verdict.transfers}>
          {cards.map((card) => {
            const { transfer } = card
            const textId = `${id}-${card.key}`
            const done = card.state === 'paid' || card.state === 'undoing'
            return (
              <li key={card.key} data-card={card.key} className={`transfer-card${done ? ' paid' : ''}`}>
                <Avatar look={lookOf(transfer.from_member_id)} size="sm" decorative />
                <span id={textId} className="transfer-text">
                  {transferText(transfer, me, nameOf)} <Money amount={transfer.amount} />
                </span>
                {done ? (
                  <span className="transfer-done">
                    <Stamp kind="paid" decorative={false} />
                    <button
                      type="button"
                      className="btn-ghost"
                      aria-describedby={textId}
                      data-action="undo"
                      disabled={card.state === 'undoing'}
                      onClick={() => {
                        if (card.paymentId !== undefined) onUndo(card.paymentId)
                      }}
                    >
                      {card.state === 'undoing' ? t.common.undoing : t.common.undo}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    aria-describedby={textId}
                    data-action="pay"
                    disabled={card.state === 'paying'}
                    onClick={() => onPaid(transfer)}
                  >
                    {card.state === 'paying' ? t.verdict.paying : t.verdict.paid}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}

      {suggested.length > 0 && (
        <>
          <button type="button" className="btn-secondary verdict-copy" onClick={copy}>
            {t.verdict.copyReminder}
          </button>
          {showText && (
            <div className="note copy-fallback">
              <label htmlFor={`${id}-reminder`}>{t.common.copyFailedText}</label>
              <textarea id={`${id}-reminder`} ref={fallback} readOnly rows={reminder.split('\n').length} value={reminder} />
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default VerdictBlock
