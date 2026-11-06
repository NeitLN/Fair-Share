import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type { Notice, Transfer } from '../api/types'
import { closeFoldOnEscape } from '../lib/fold'
import { REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import type { FocusIntent, TransferCard } from '../lib/usePaidTransfers'
import { transferText, verdict } from '../lib/verdict'
import { Avatar } from './Avatar'
import { Stamp } from './Chip'
import { Money } from './Money'
import { useT } from '../i18n'

interface VerdictBlockProps {
  /** The suggested transfers, in the order the API gives them: the reminder. */
  suggested: Transfer[]
  /**
   * What the sentence and the total count: like `suggested`, but a transfer still being recorded is still
   * owed, so success is never announced before the server has it. Defaults to `suggested`.
   */
  owed?: Transfer[]
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
  /** `told`: the receiver's "Đã nhận" on a "Tôi đã chuyển" for exactly `transfer.amount`. */
  onPaid: (transfer: Transfer, told?: boolean) => void
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
  /**
   * Only the person a transfer goes to can record it ("Đã nhận"); the person who owes can tell them
   * "Tôi đã chuyển" (docs/ACCOUNTS.md, S2 and S3), and everyone else sees where it stands.
   */
  onlyReceiver?: boolean
  /**
   * The household's "Tôi đã chuyển" notices (with onlyReceiver); undefined while they are not known
   * (loading, or failed: noticesError), when nothing that depends on them can be pressed.
   */
  notices?: Notice[]
  noticesError?: string | null
  onRetryNotices?: () => void
  /**
   * The person who owes tells the receiver; takes it back; the receiver says it has not arrived (the
   * transfer then carries the told amount).
   */
  onNotify?: (transfer: Transfer) => void
  onCancelNotice?: (transfer: Transfer) => void
  onDecline?: (transfer: Transfer) => void
  /** The pairs ("from-to") whose notice is being sent, taken back or declined. */
  noticeBusy?: string[]
  /** "Vì sao ra số này?" under the amount: your own balance explained (specs/002-balance-explanation). */
  explanation?: ReactNode
}

/** Where focus goes once a notice press is answered and the pressed button has gone. */
type NoticeFocus = { pair: string; then: 'notify' | 'cancel-notice' | 'pay' }

const pairOf = (transfer: { from_member_id: number; to_member_id: number }) =>
  `${transfer.from_member_id}-${transfer.to_member_id}`

/**
 * The taro block at the top of Tổng quan (DESIGN.md §6.2): one sentence about you, the total, the
 * transfers that settle everyone, and the reminder for the household's group chat. Props only; the page
 * records the transfers.
 */
function VerdictBlock({
  suggested,
  owed = suggested,
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
  onlyReceiver = false,
  notices,
  noticesError = null,
  onRetryNotices,
  onNotify,
  onCancelNotice,
  onDecline,
  noticeBusy = [],
  explanation,
}: VerdictBlockProps) {
  const t = useT()
  const id = useId()
  const [showText, setShowText] = useState(false)
  const fallback = useRef<HTMLTextAreaElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const noticeFocus = useRef<NoticeFocus | null>(null)
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

  // The same for "Tôi đã chuyển", "Huỷ báo" and "Chưa nhận được": each is replaced by the next step
  // once answered (Huỷ báo, Tôi đã chuyển, Đã nhận). A failed press leaves its own button: back to it
  useEffect(() => {
    const wanted = noticeFocus.current
    if (!wanted || noticeBusy.includes(wanted.pair)) return
    noticeFocus.current = null
    const lost = !document.activeElement || document.activeElement === document.body
    const card = list.current?.querySelector(`[data-pair="${wanted.pair}"]`)
    if (!lost || !card) return
    const next =
      card.querySelector<HTMLButtonElement>(`button[data-action="${wanted.then}"]:not(:disabled)`) ??
      card.querySelector<HTMLButtonElement>('button:not(:disabled)')
    next?.focus()
  })
  const pressed = (pair: string, then: NoticeFocus['then'], act?: (transfer: Transfer) => void) =>
    act &&
    ((transfer: Transfer) => {
      noticeFocus.current = { pair, then }
      act(transfer)
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

  if (loading || loadError) {
    return (
      <section className="verdict" aria-labelledby={`${id}-title`} aria-busy={loading || undefined}>
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

  const { sentence, total } = verdict(owed, me, nameOf, started)

  // A notice whose pair is no longer suggested (an expense or another repayment changed the balances)
  // keeps its own card, so it can still be answered or taken back: the money may have moved. A declined
  // one only matters to the person who told it.
  const onScreen = new Set(cards.map((card) => pairOf(card.transfer)))
  const leftOver: TransferCard[] = (onlyReceiver ? (notices ?? []) : [])
    .filter((n) => !onScreen.has(pairOf(n)) && (n.status === 'sent' || n.from_member_id === me))
    .map((n) => ({
      key: `told-${pairOf(n)}`,
      transfer: { from_member_id: n.from_member_id, to_member_id: n.to_member_id, amount: n.amount },
      state: 'open' as const,
    }))
  // Yours first, the household's after: the sentence above talks to you. A stable split, so a card does
  // not move while you press it
  const mine = (card: TransferCard) =>
    me !== null && (card.transfer.from_member_id === me || card.transfer.to_member_id === me)
  const all = [...cards, ...leftOver]
  const shown = [...all.filter(mine), ...all.filter((card) => !mine(card))]
  // What you told someone you sent, under the amount: it still counts until they confirm (S3)
  const ownTold = onlyReceiver ? (notices ?? []).filter((n) => n.status === 'sent' && n.from_member_id === me) : []
  // Nothing to list and nothing to copy: no empty panel under the answer
  const hasPanel = Boolean((onlyReceiver && noticesError) || shown.length > 0 || error || suggested.length > 0)

  return (
    <>
      <section className="verdict" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} ref={heading} className="verdict-sentence" tabIndex={-1}>
          {sentence}
        </h2>
        {total !== null && (
          <p className="verdict-total">
            <Money amount={total} />
          </p>
        )}
        {explanation && (
          <details className="explain-fold" onKeyDown={closeFoldOnEscape}>
            <summary>{t.explain.open}</summary>
            {explanation}
          </details>
        )}
        {ownTold.map((n) => (
          <p key={pairOf(n)} className="verdict-pending">
            {t.verdict.ownPending(nameOf(n.to_member_id), <Money amount={n.amount} />)}
          </p>
        ))}
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
      </section>
      {/* Verdict B (specs/003-desktop-redesign): the taro block answers, what to do sits in a calm panel under it */}
      {hasPanel && (
        <section className="transfers-panel">
          {onlyReceiver && noticesError && (
            <div className="note" role="alert">
              {t.verdict.noticesFailed} {noticesError}
              {onRetryNotices && (
                <button type="button" className="btn-secondary" onClick={onRetryNotices}>
                  {t.common.tryAgain}
                </button>
              )}
            </div>
          )}

          {shown.length > 0 && (
            <ul ref={list} className="transfer-list" aria-label={t.verdict.transfers}>
              {shown.map((card) => {
                const { transfer } = card
                const pair = pairOf(transfer)
                const textId = `${id}-${card.key}`
                const done = card.state === 'paid' || card.state === 'undoing'
                return (
                  <li
                    key={card.key}
                    data-card={card.key}
                    data-pair={pair}
                    className={`transfer-card${done ? ' paid' : ''}`}
                  >
                    <Avatar look={lookOf(transfer.from_member_id)} size="sm" decorative />
                    <span id={textId} className="transfer-text">
                      {transferText(transfer, me, nameOf, done)} <Money amount={transfer.amount} />
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
                    ) : onlyReceiver ? (
                      <ReceiverOnly
                        transfer={transfer}
                        card={card}
                        textId={textId}
                        me={me}
                        nameOf={nameOf}
                        known={notices !== undefined}
                        notice={notices?.find((n) => pairOf(n) === pair)}
                        outdated={card.key.startsWith('told-')}
                        busy={noticeBusy.includes(pair)}
                        onPaid={onPaid}
                        onNotify={pressed(pair, 'cancel-notice', onNotify)}
                        onCancelNotice={pressed(pair, 'notify', onCancelNotice)}
                        onDecline={pressed(pair, 'pay', onDecline)}
                      />
                    ) : (
                      <span className="transfer-actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          aria-describedby={textId}
                          data-action="pay"
                          disabled={card.state === 'paying'}
                          onClick={() => onPaid(transfer)}
                        >
                          {card.state === 'paying' ? t.verdict.paying : t.verdict.paid}
                        </button>
                      </span>
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
              <button type="button" className="verdict-copy" onClick={copy}>
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
      )}
    </>
  )
}

interface ReceiverOnlyProps {
  transfer: Transfer
  card: TransferCard
  textId: string
  me: number | null
  nameOf: (memberId: number) => string
  /** The notices have loaded: until then nothing that depends on them can be pressed. */
  known: boolean
  notice: Notice | undefined
  /** The card is the notice alone: its pair is not suggested any more. */
  outdated: boolean
  busy: boolean
  onPaid: (transfer: Transfer, told?: boolean) => void
  onNotify?: (transfer: Transfer) => void
  onCancelNotice?: (transfer: Transfer) => void
  onDecline?: (transfer: Transfer) => void
}

/**
 * An open transfer once only its receiver records it (docs/ACCOUNTS.md, S2 and S3). The receiver
 * gets "Đã nhận", and "Chưa nhận được" when told it was sent; told an amount, Đã nhận records that
 * amount, and the status says so when it is not today's suggestion. The person who owes gets "Tôi đã
 * chuyển", which tells the receiver and changes no balance, and can take it back. Everyone else sees
 * where it stands. Under the names and the amount: where it stands, then what you can do about it, in
 * that order and in both languages (DESIGN.md §6.2).
 */
function ReceiverOnly({
  transfer,
  card,
  textId,
  me,
  nameOf,
  known,
  notice,
  outdated,
  busy,
  onPaid,
  onNotify,
  onCancelNotice,
  onDecline,
}: ReceiverOnlyProps) {
  const t = useT()
  const from = nameOf(transfer.from_member_id)
  const to = nameOf(transfer.to_member_id)
  const told = notice?.status === 'sent' ? notice : undefined
  const declined = notice?.status === 'declined'
  const statusId = `${textId}-status`
  const cancel = (
    <button
      type="button"
      className="btn-ghost"
      aria-describedby={textId}
      data-action="cancel-notice"
      disabled={busy}
      onClick={() => onCancelNotice?.(transfer)}
    >
      {t.verdict.cancelNotice}
    </button>
  )

  if (transfer.to_member_id === me) {
    const asTold = told && { ...transfer, amount: told.amount }
    return (
      <>
        {asTold ? (
          <span className="transfer-status">
            <small id={statusId}>
              {t.verdict.toldMe(from)} <Money amount={asTold.amount} />.{' '}
              {outdated ? t.verdict.outdated : asTold.amount !== transfer.amount && t.verdict.amountDiffers}
            </small>
          </span>
        ) : (
          declined && (
            <span className="transfer-status">
              <small>{t.verdict.youDeclined(from)}</small>
            </span>
          )
        )}
        <span className="transfer-actions">
          <button
            type="button"
            className="btn-secondary"
            // Told: the status line carries the amount that Đã nhận records
            aria-describedby={told ? `${textId} ${statusId}` : textId}
            data-action="pay"
            disabled={card.state === 'paying' || busy || !known}
            onClick={() => (asTold ? onPaid(asTold, true) : onPaid(transfer))}
          >
            {card.state === 'paying' ? (
              t.verdict.paying
            ) : (
              // One run of text, so a narrow card wraps it as a sentence and not as two columns
              <span>{t.verdict.received(<Money amount={(asTold ?? transfer).amount} />)}</span>
            )}
          </button>
          {asTold && (
            <button
              type="button"
              className="btn-ghost"
              aria-describedby={`${textId} ${statusId}`}
              data-action="decline"
              disabled={busy || card.state === 'paying'}
              onClick={() => onDecline?.(asTold)}
            >
              {t.verdict.notReceived}
            </button>
          )}
        </span>
      </>
    )
  }

  if (transfer.from_member_id === me) {
    if (told) {
      return (
        <>
          <span className="transfer-status">
            <small>
              {t.verdict.toldWaiting(to)}
              {outdated && <> {t.verdict.outdated}</>}
            </small>
          </span>
          <span className="transfer-actions">{cancel}</span>
        </>
      )
    }
    // Declined, and not suggested any more: nothing to tell again, only to take back
    if (outdated) {
      return (
        <>
          <span className="transfer-status">
            <small>{t.verdict.declinedBy(to)}</small>
          </span>
          <span className="transfer-actions">{cancel}</span>
        </>
      )
    }
    return (
      <>
        <span className="transfer-status">
          <small>{declined ? t.verdict.declinedBy(to) : t.verdict.notifyHint(to)}</small>
        </span>
        <span className="transfer-actions">
          <button
            type="button"
            className="btn-secondary"
            aria-describedby={textId}
            data-action="notify"
            disabled={busy || !known}
            onClick={() => onNotify?.(transfer)}
          >
            {busy ? t.verdict.notifying : t.verdict.notify}
          </button>
          {declined && cancel}
        </span>
      </>
    )
  }

  return (
    <span className="transfer-status">
      <small>{told ? t.verdict.toldOthers(from, to) : t.verdict.notPaidYet}</small>
    </span>
  )
}

export default VerdictBlock
