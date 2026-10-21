import { useEffect, useId, useRef, useState } from 'react'

import type { Transfer } from '../api/types'
import { REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import type { TransferCard } from '../lib/usePaidTransfers'
import { transferText, verdict } from '../lib/verdict'
import { Avatar } from './Avatar'
import { Stamp } from './Chip'
import { Money } from './Money'

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
  onRetry?: () => void
  onPaid: (transfer: Transfer, index: number) => void
  onUndo: (paymentId: number) => void
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
  onRetry,
  onPaid,
  onUndo,
  error = null,
  reminder,
  onCopied,
}: VerdictBlockProps) {
  const id = useId()
  const [showText, setShowText] = useState(false)
  const fallback = useRef<HTMLTextAreaElement>(null)
  const list = useRef<HTMLUListElement>(null)
  // Where keyboard focus should land once a card changes under it: Đã trả turns into the stamped card's
  // Hoàn tác, and Hoàn tác back into Đã trả. Only when focus was lost with the button, never stolen.
  const focusNext = useRef<{ pair: string; action: 'undo' | 'pay' } | null>(null)
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

  useEffect(() => {
    const wanted = focusNext.current
    if (!wanted) return
    const button = list.current?.querySelector<HTMLButtonElement>(
      `button[data-pair="${wanted.pair}"][data-action="${wanted.action}"]:not(:disabled)`,
    )
    if (!button) return
    focusNext.current = null
    const active = document.activeElement
    if (!active || active === document.body) button.focus()
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
      Tháng {month}
      {spent !== null && (
        <>
          {' '}
          · cả nhà đã chi <Money amount={spent} />
        </>
      )}
      {spent === null && spentUnavailable && ' · chưa tải được tổng chi'}
    </p>
  )

  if (loading || loadError) {
    return (
      <section className="verdict" aria-labelledby={`${id}-title`} aria-busy={loading || undefined}>
        {monthLine}
        <h2 id={`${id}-title`} className="verdict-sentence">
          {loading ? 'Đang tính ai trả ai…' : 'Chưa tính được ai trả ai'}
        </h2>
        {loadError && (
          <div className="note" role="alert">
            {loadError}
            {onRetry && (
              <button type="button" className="btn-secondary" onClick={onRetry}>
                Thử lại
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
      <h2 id={`${id}-title`} className="verdict-sentence">
        {sentence}
      </h2>
      {total !== null && (
        <p className="verdict-total">
          <Money amount={total} />
        </p>
      )}

      {cards.length > 0 && (
        <ul ref={list} className="transfer-list" aria-label="Các lần trả gợi ý">
          {cards.map((card, index) => {
            const { transfer } = card
            const pair = `${transfer.from_member_id}-${transfer.to_member_id}`
            const textId = `${id}-${card.key}`
            const done = card.state === 'paid' || card.state === 'undoing'
            return (
              <li key={card.key} className={`transfer-card${done ? ' paid' : ''}`}>
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
                      data-pair={pair}
                      data-action="undo"
                      disabled={card.state === 'undoing'}
                      onClick={() => {
                        focusNext.current = { pair, action: 'pay' }
                        if (card.paymentId !== undefined) onUndo(card.paymentId)
                      }}
                    >
                      {card.state === 'undoing' ? 'Đang hoàn tác…' : 'Hoàn tác'}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    aria-describedby={textId}
                    data-pair={pair}
                    data-action="pay"
                    disabled={card.state === 'paying'}
                    onClick={() => {
                      focusNext.current = { pair, action: 'undo' }
                      onPaid(transfer, index)
                    }}
                  >
                    {card.state === 'paying' ? 'Đang ghi…' : 'Đã trả'}
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
            Sao chép tin nhắn nhắc nợ
          </button>
          {showText && (
            <div className="note copy-fallback">
              <label htmlFor={`${id}-reminder`}>Không sao chép được. Chọn đoạn dưới đây rồi sao chép:</label>
              <textarea id={`${id}-reminder`} ref={fallback} readOnly rows={reminder.split('\n').length} value={reminder} />
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default VerdictBlock
