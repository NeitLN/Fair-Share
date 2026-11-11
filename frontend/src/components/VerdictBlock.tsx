import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type { Notice, ReceivingHint, Transfer } from '../api/types'
import { closeFoldOnEscape } from '../lib/fold'
import { formatVND } from '../lib/money'
import { MAX_AMOUNT } from '../lib/split'
import { REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { classify } from '../lib/notices'
import type { FocusIntent, PayOutcome, ToldAnswer, TransferCard } from '../lib/usePaidTransfers'
import { transferText, verdict, verdictPeople } from '../lib/verdict'
import { Avatar } from './Avatar'
import FoldMore from './FoldMore'
import PaymentQrPanel from './PaymentQrPanel'
import { Stamp } from './Chip'
import { Money } from './Money'
import NoticeAmountStep from './NoticeAmountStep'
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
  /**
   * `told`: the receiver's "Đã nhận" on the "Tôi đã chuyển" notice of that version, for `transfer.amount`
   * (all of it, or less with "Nhận số khác", specs/014).
   */
  onPaid: (transfer: Transfer, told?: ToldAnswer, onDone?: (outcome: PayOutcome) => void) => void
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
   * The person who owes tells the receiver (the whole suggestion, or `part`: "Chuyển số khác"); takes it
   * back; the receiver says it has not arrived (the transfer then carries the told amount). A call with
   * `part` resolves to the server's refusal, said in the step, or null once told.
   */
  onNotify?: (transfer: Transfer, part?: NoticePart) => Promise<string | null> | void
  /** "Báo thêm": `part` more on the waiting notice; resolves like onNotify with a part. */
  onAddToNotice?: (transfer: Transfer, part: NoticePart) => Promise<string | null>
  onCancelNotice?: (transfer: Transfer) => void
  onDecline?: (transfer: Transfer) => void
  /** The pairs ("from-to") whose notice is being sent, taken back or declined. */
  noticeBusy?: string[]
  /** "Vì sao ra số này?" under the amount: your own balance explained (specs/002-balance-explanation). */
  explanation?: ReactNode
  /**
   * A busy house (plan G2-10): the id of the house, and the transfers that are not about you fold behind
   * "N lần trả khác trong nhà", remembered per house. Undefined: every card shows, as before.
   */
  foldOthers?: number
  /**
   * Paying by VietQR (specs/016-vietqr): the house, and each member's receiving-account hint from the
   * members list. With both, the debtor's action offers "Mở mã QR" for a receiver with an account.
   */
  householdId?: number
  receivingHints?: Map<number, ReceivingHint | null>
}

/** An amount told from a step, with its note ("" or left out: none). */
export interface NoticePart {
  amount: number
  note?: string
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
/** What was typed in a receiver's "Nhận số khác" while it is sent or after it was refused. */
interface PartDraft {
  amount: number
  problem: string | null
  sending: boolean
  /** Above the suggestion: warned about this one (specs/019, FR-004); the next Gửi records with it. */
  warned?: number
}

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
  onAddToNotice,
  onCancelNotice,
  onDecline,
  noticeBusy = [],
  explanation,
  foldOthers,
  householdId,
  receivingHints,
}: VerdictBlockProps) {
  const t = useT()
  const id = useId()
  const [showText, setShowText] = useState(false)
  // "Nhận số khác" being recorded or refused, per pair: kept here because the card is drawn again while
  // it is sent, so the step stays open with what was typed and its error (specs/018, FR-009, research R9)
  const [partDrafts, setPartDrafts] = useState<Record<string, PartDraft>>({})
  const partDraftFor = (pair: string) => (draft: PartDraft | null) =>
    setPartDrafts((current) => {
      const next = { ...current }
      if (draft) next[pair] = draft
      else delete next[pair]
      return next
    })
  const fallback = useRef<HTMLTextAreaElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const debtorActions = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const noticeFocus = useRef<NoticeFocus | null>(null)
  const explainFold = useRef<HTMLDetailsElement>(null)
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
  // once answered (Huỷ báo, Tôi đã chuyển, Đã nhận). A failed press leaves its own button: back to it.
  // The debtor's action is under the block, so both places are searched.
  useEffect(() => {
    const wanted = noticeFocus.current
    if (!wanted || noticeBusy.includes(wanted.pair)) return
    noticeFocus.current = null
    const lost = !document.activeElement || document.activeElement === document.body
    const scopes = [
      list.current?.querySelector(`[data-pair="${wanted.pair}"]`),
      debtorActions.current?.querySelector(`[data-pair="${wanted.pair}"]`),
    ].filter((scope): scope is Element => scope !== null && scope !== undefined)
    if (!lost || scopes.length === 0) return
    for (const scope of scopes) {
      const next =
        scope.querySelector<HTMLButtonElement>(`button[data-action="${wanted.then}"]:not(:disabled)`) ??
        scope.querySelector<HTMLButtonElement>('button:not(:disabled)')
      if (next) {
        next.focus()
        return
      }
    }
  })
  const pressed = <A extends unknown[], R>(
    pair: string,
    then: NoticeFocus['then'],
    act?: (transfer: Transfer, ...rest: A) => R,
  ) =>
    act &&
    ((transfer: Transfer, ...rest: A) => {
      noticeFocus.current = { pair, then }
      return act(transfer, ...rest)
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
  const people = verdictPeople(owed, me)

  // A notice whose pair is no longer suggested (an expense or another repayment changed the balances)
  // keeps its own card, so it can still be answered or taken back: the money may have moved. Decided from
  // the suggestions only, so a stamped card of the same pair never hides it (specs/019, FR-001). A
  // declined one only matters to the person who told it.
  const paying = new Set(cards.filter((card) => card.state === 'paying').map((card) => pairOf(card.transfer)))
  const leftOver: TransferCard[] = (onlyReceiver ? (notices ?? []) : [])
    .filter((n) => classify(n, suggested).kind === 'unmatched' && !paying.has(pairOf(n)))
    .filter((n) => n.status === 'sent' || n.from_member_id === me)
    .map((n) => ({
      key: `told-${pairOf(n)}`,
      transfer: { from_member_id: n.from_member_id, to_member_id: n.to_member_id, amount: n.amount },
      state: 'open' as const,
    }))
  // Yours first, the household's after: the sentence above talks to you. A stable split, so a card does
  // not move while you press it
  const aboutMe = (card: TransferCard) =>
    me !== null && (card.transfer.from_member_id === me || card.transfer.to_member_id === me)
  // The one transfer you must make is already the block's action: not repeated as a row (FR-014)
  const toTellNow = onlyReceiver && me !== null ? suggested.filter((t) => t.from_member_id === me) : []
  const repeated = toTellNow.length === 1 ? `open-${pairOf(toTellNow[0])}` : null
  const all = [...cards.filter((card) => card.key !== repeated), ...leftOver]
  const mine = all.filter(aboutMe)
  const others = all.filter((card) => !aboutMe(card))
  const shown = [...mine, ...others]
  // The transfers you must make: their action is under the block, where the eye lands first (US2)
  const toTell = onlyReceiver && me !== null ? suggested.filter((t) => t.from_member_id === me) : []
  // Nothing to list and nothing to copy: no empty panel under the answer
  const hasPanel = Boolean((onlyReceiver && noticesError) || shown.length > 0 || error || suggested.length > 0)

  // FR-002, FR-004a: the receiver, the one who told, everyone else
  const unmatchedLine = (transfer: Transfer, notice: Notice | undefined) => {
    const from = nameOf(transfer.from_member_id)
    const to = nameOf(transfer.to_member_id)
    const amount = <Money amount={transfer.amount} />
    if (me === transfer.to_member_id) {
      return (
        <>
          {t.notices.unmatchedToMe(from, amount)}
          {suggested.length === 0 && t.notices.houseSettled}
        </>
      )
    }
    if (me === transfer.from_member_id) {
      return notice?.status === 'declined'
        ? t.notices.declinedUnmatched(to, amount)
        : t.notices.unmatchedFromMe(amount, to)
    }
    return t.notices.unmatchedOthers(from, amount, to)
  }

  const renderCard = (card: TransferCard) => {
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
          {card.key.startsWith('told-') ? (
            // Not suggested any more: said for what it is, never as a debt (specs/019, FR-002)
            unmatchedLine(transfer, notices?.find((n) => pairOf(n) === pair))
          ) : (
            <>
              {transferText(transfer, me, nameOf, done)} <Money amount={transfer.amount} />
            </>
          )}
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
            actionless={transfer.from_member_id === me && !card.key.startsWith('told-')}
            busy={noticeBusy.includes(pair)}
            partDraft={partDrafts[pair]}
            onPartDraft={partDraftFor(pair)}
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
  }

  return (
    <>
      <section className={`verdict${people.length > 0 ? ' has-people' : ''}`} aria-labelledby={`${id}-title`}>
        {/* Who the money comes from (or goes to, when you owe), as stickers in the corner (owner, 07/11).
            Decoration: the sentence already names them */}
        {people.length > 0 && (
          <span className="avatar-stack verdict-people" aria-hidden="true">
            {people.slice(0, 3).map((memberId) => (
              <Avatar key={memberId} look={lookOf(memberId)} size="lg" decorative />
            ))}
            {people.length > 3 && <span className="avatar avatar-lg avatar-more">+{people.length - 3}</span>}
          </span>
        )}
        <h2 id={`${id}-title`} ref={heading} className="verdict-sentence" tabIndex={-1}>
          {sentence}
        </h2>
        {total !== null && (
          <p className="verdict-total">
            <Money amount={total} />
          </p>
        )}
        {explanation && (
          <details ref={explainFold} className="explain-fold" onKeyDown={closeFoldOnEscape}>
            <summary>{t.explain.open}</summary>
            {explanation}
          </details>
        )}
        {toTell.length > 0 && (
          <div className="debtor-actions" ref={debtorActions}>
            {toTell.map((transfer) => {
              const pair = pairOf(transfer)
              return (
                <DebtorAction
                  key={pair}
                  transfer={transfer}
                  notice={notices?.find((n) => pairOf(n) === pair)}
                  nameOf={nameOf}
                  known={notices !== undefined}
                  busy={noticeBusy.includes(pair)}
                  onNotify={pressed(pair, 'cancel-notice', onNotify)}
                  onAddToNotice={pressed(pair, 'cancel-notice', onAddToNotice)}
                  onCancelNotice={pressed(pair, 'notify', onCancelNotice)}
                  qr={
                    householdId !== undefined && receivingHints
                      ? { householdId, hint: receivingHints.get(transfer.to_member_id) ?? null }
                      : undefined
                  }
                />
              )
            })}
            {/* Why one transfer to one person (specs/014 US4): said once, under every action */}
            {/* One "Vì sao ra số này?", the fold under the amount (specs/019, FR-015) */}
            <p className="debtor-hint">{t.verdict.combinedHint}</p>
          </div>
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
            <div ref={list}>
              {(foldOthers === undefined ? shown : mine).length > 0 && (
                <ul className="transfer-list" aria-label={t.verdict.transfers}>
                  {(foldOthers === undefined ? shown : mine).map(renderCard)}
                </ul>
              )}
              {foldOthers !== undefined && others.length > 0 && (
                <FoldMore householdId={foldOthers} name="transfers" summary={t.verdict.othersFold(others.length)}>
                  <ul className="transfer-list" aria-label={t.verdict.othersList}>
                    {others.map(renderCard)}
                  </ul>
                </FoldMore>
              )}
            </div>
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

interface DebtorActionProps {
  transfer: Transfer
  notice: Notice | undefined
  nameOf: (memberId: number) => string
  /** The notices have loaded: until then nothing that depends on them can be pressed. */
  known: boolean
  busy: boolean
  onNotify?: (transfer: Transfer, part?: NoticePart) => Promise<string | null> | void
  onAddToNotice?: (transfer: Transfer, part: NoticePart) => Promise<string | null>
  onCancelNotice?: (transfer: Transfer) => void
  /** The house and the receiver's hint, for "Mở mã QR" (specs/016-vietqr); undefined: no QR at all. */
  qr?: { householdId: number; hint: ReceivingHint | null }
}

/**
 * The next step for someone who owes money (DESIGN.md §6.2, spec 012 US2, specs/014): one line under the
 * block, per transfer they must make. No notice: the primary "Tôi đã chuyển … cho …" for the whole amount
 * in one press, and "Chuyển số khác" for another amount with a note. Told: how it compares with what is
 * owed now ("còn thiếu" with "Báo thêm", or "nhiều hơn"), and the way to take it back. Declined: what the
 * receiver said, and the buttons again.
 */
function DebtorAction({ transfer, notice, nameOf, known, busy, onNotify, onAddToNotice, onCancelNotice, qr }: DebtorActionProps) {
  const t = useT()
  const to = nameOf(transfer.to_member_id)
  const current = transfer.amount
  const sent = notice?.status === 'sent' ? notice : undefined
  const declined = notice?.status === 'declined' ? notice : undefined
  // One step open at a time: "Chuyển số khác" (nothing waiting) or "Báo thêm" (told less than owed)
  const [step, setStep] = useState<'other' | 'more' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const opener = useRef<HTMLButtonElement>(null)
  // More than one notice can hold: the button cannot tell it all at once
  const tooLarge = current > MAX_AMOUNT
  const ceiling = Math.min(current, MAX_AMOUNT)
  // Paying by VietQR (specs/016-vietqr): not when a waiting notice already covers what is owed (FR-015)
  const root = useRef<HTMLDivElement>(null)
  const qrOpener = useRef<HTMLButtonElement>(null)
  // Open for the notice it was opened with: telling, adding or taking back changes the notice and
  // closes the panel, so it never comes back and takes the focus from the next step (review of #271)
  const noticeKey = notice ? `${notice.status}:${notice.version}` : 'none'
  const [qrOpenFor, setQrOpenFor] = useState<string | null>(null)
  const qrOpen = qrOpenFor === noticeKey
  const covered = sent !== undefined && sent.amount >= current
  // Back to the opener; if a refresh took it away, the debtor's own action, then the verdict heading
  const focusAfterQr = () => {
    const target =
      (qrOpener.current?.isConnected ? qrOpener.current : null) ??
      root.current?.querySelector<HTMLButtonElement>('button:not(:disabled)') ??
      document.querySelector<HTMLElement>('.verdict-sentence')
    target?.focus()
  }
  const closeQr = () => {
    setQrOpenFor(null)
    focusAfterQr()
  }
  // Closed because the notice changed elsewhere (the receiver's "Chưa nhận được" on a refresh) while
  // the focus was inside the panel: it goes back to "Mở mã QR", not to the top of the page. When the
  // payer tells it themselves the focus is already outside, and the next step keeps it (review of #271)
  const qrHadFocus = useRef(false)
  useEffect(() => {
    if (qrOpenFor === null || qrOpenFor === noticeKey || !qrHadFocus.current) return
    qrHadFocus.current = false
    focusAfterQr()
  })
  const qrButton = qr?.hint && !covered && (
    <button
      ref={qrOpener}
      type="button"
      className="btn-ghost"
      data-action="open-qr"
      aria-expanded={qrOpen}
      onClick={() => setQrOpenFor(qrOpen ? null : noticeKey)}
    >
      {t.verdict.qrOpen}
    </button>
  )
  const qrMore = qr && !covered && (
    qr.hint ? (
      qrOpen && (
        <div
          className="qr-wrap"
          onFocusCapture={() => (qrHadFocus.current = true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) qrHadFocus.current = false
          }}
        >
          <PaymentQrPanel householdId={qr.householdId} memberId={transfer.to_member_id} to={to} onClose={closeQr} />
        </div>
      )
    ) : (
      <p className="debtor-qr-missing">{t.verdict.qrNoAccount(to)}</p>
    )
  )

  const toggle = (which: 'other' | 'more') => {
    setProblem(null)
    setStep((open) => (open === which ? null : which))
  }
  const close = () => {
    setStep(null)
    setProblem(null)
    opener.current?.focus()
  }
  // A refusal stays in the step with what was typed and the page's new numbers; success closes it
  async function told(answer: Promise<string | null> | void) {
    const refused = (await answer) ?? null
    setProblem(refused)
    if (!refused) setStep(null)
  }
  const cancel = (
    <button
      type="button"
      className="btn-ghost"
      data-action="cancel-notice"
      disabled={busy}
      onClick={() => onCancelNotice?.(transfer)}
    >
      {t.verdict.cancelNotice}
    </button>
  )
  const note = (n: Notice | undefined) => n?.note && <p className="notice-note">“{n.note}”</p>

  if (sent) {
    const rest = current - sent.amount
    return (
      <div className="debtor-action" data-pair={pairOf(transfer)} ref={root}>
        <p>
          {rest > 0
            ? t.verdict.toldShort(<Money amount={sent.amount} />, <Money amount={rest} />)
            : rest < 0
              ? t.verdict.toldMore(<Money amount={sent.amount} />, <Money amount={current} />)
              : t.verdict.debtorSent(<Money amount={sent.amount} />, to)}
        </p>
        {note(sent)}
        <span className="debtor-buttons">
          {rest > 0 && sent.amount < MAX_AMOUNT && (
            <button
              ref={opener}
              type="button"
              className="btn-ghost"
              data-action="add-more"
              aria-expanded={step === 'more'}
              disabled={busy}
              onClick={() => toggle('more')}
            >
              {t.verdict.addMore}
            </button>
          )}
          {qrButton}
          {cancel}
        </span>
        {qrMore}
        {step === 'more' && rest > 0 && (
          <NoticeAmountStep
            label={t.verdict.addLabel}
            initial={Math.min(rest, MAX_AMOUNT - sent.amount)}
            max={Math.min(rest, MAX_AMOUNT - sent.amount)}
            maxMessage={() => t.verdict.overOwed(formatVND(current))}
            hint={t.verdict.upTo(formatVND(current))}
            sumLine={(more) => t.verdict.sumLine(formatVND(sent.amount), formatVND(more), formatVND(sent.amount + more))}
            withNote
            submitLabel={t.verdict.send}
            busy={busy}
            busyLabel={t.verdict.notifying}
            // The rest of what is owed, when the 10^12 limit is not what stops it (specs/019, FR-021)
            fill={
              rest <= MAX_AMOUNT - sent.amount
                ? { amount: rest, line: t.notices.onlyMore(formatVND(rest)), label: t.notices.addExact(formatVND(rest)) }
                : undefined
            }
            serverProblem={problem}
            onSubmit={(amount, typed) => void told(onAddToNotice?.(transfer, { amount, note: typed }))}
            onCancel={close}
          />
        )}
      </div>
    )
  }

  return (
    <div className="debtor-action" data-pair={pairOf(transfer)} ref={root}>
      {declined && <p>{t.verdict.debtorDeclined(to, <Money amount={declined.amount} />)}</p>}
      {note(declined)}
      <button
        type="button"
        className="btn-primary"
        data-action="notify"
        disabled={busy || !known}
        onClick={() => (tooLarge ? toggle('other') : onNotify?.(transfer))}
      >
        {busy ? (
          t.verdict.notifying
        ) : tooLarge ? (
          t.verdict.amountTooLarge
        ) : (
          <span>{t.verdict.debtorSend(<Money amount={current} />, to)}</span>
        )}
      </button>
      <span className="debtor-buttons">
        <button
          ref={opener}
          type="button"
          className="btn-ghost"
          data-action="tell-other"
          aria-expanded={step === 'other'}
          disabled={busy || !known}
          onClick={() => toggle('other')}
        >
          {t.verdict.tellOther}
        </button>
        {qrButton}
        {declined && cancel}
      </span>
      {qrMore}
      {step === 'other' && (
        <NoticeAmountStep
          label={t.verdict.tellLabel}
          initial={ceiling}
          max={ceiling}
          maxMessage={() => t.verdict.overOwed(formatVND(current))}
          hint={t.verdict.upTo(formatVND(current))}
          withNote
          submitLabel={t.verdict.send}
          busy={busy}
          busyLabel={t.verdict.notifying}
          // What is owed, unless the 10^12 limit is what stops it (specs/019, FR-021)
          fill={
            tooLarge
              ? undefined
              : { amount: ceiling, line: t.notices.onlyNeed(to, formatVND(ceiling)), label: t.notices.tellExact(formatVND(ceiling)) }
          }
          serverProblem={problem}
          onSubmit={(amount, typed) => void told(onNotify?.(transfer, { amount, note: typed }))}
          onCancel={close}
        />
      )}
    </div>
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
  /** The debtor's own suggested row: the status stays, the action is the one under the block. */
  actionless: boolean
  busy: boolean
  /** "Nhận số khác" on its way or refused: the step stays open with it (specs/018). */
  partDraft?: PartDraft
  onPartDraft: (draft: PartDraft | null) => void
  onPaid: (transfer: Transfer, told?: ToldAnswer, onDone?: (outcome: PayOutcome) => void) => void
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
  actionless,
  busy,
  partDraft,
  onPartDraft,
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
  // "Nhận số khác": the receiver records less than was told; the rest keeps waiting (specs/014)
  const [partOpen, setPartOpen] = useState(() => partDraft !== undefined)
  const partOpener = useRef<HTMLButtonElement>(null)
  // The over-suggestion warning on screen, for the notice version and suggestion it named (specs/019)
  const [warn, setWarn] = useState<{ amount: number; suggestion: number; version: number } | null>(null)
  const nowSuggested = outdated ? 0 : transfer.amount
  // Withdrawn when the notice or the suggestion changed since it was shown (FR-005)
  if (warn && (warn.version !== told?.version || warn.suggestion !== nowSuggested)) setWarn(null)
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
    // What is suggested from them right now: nothing for a notice that no longer matches (specs/019)
    const suggestion = outdated ? 0 : transfer.amount
    // More than the suggestion asks first, then records with the suggestion it named (FR-003, FR-004)
    const record = (amount: number, warned?: number) => {
      if (!told || !asTold) return
      if (amount > suggestion && warned === undefined) {
        setWarn({ amount, suggestion, version: told.version })
        return
      }
      setWarn(null)
      onPaid({ ...asTold, amount }, {
        version: told.version,
        warned,
        onWarn: (now) => setWarn({ amount, suggestion: now, version: told.version }),
      })
    }
    const warning = warn && (
      <div className="notice-warning" role="status">
        <p>
          {warn.suggestion === 0
            ? t.notices.warnUnmatched(from, formatVND(warn.amount))
            : t.notices.warnOver(from, formatVND(warn.suggestion), formatVND(warn.amount), formatVND(warn.amount - warn.suggestion))}
        </p>
        <span className="debtor-buttons">
          <button type="button" className="btn-secondary" data-action="record-anyway" onClick={() => record(warn.amount, warn.suggestion)}>
            {t.notices.record}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setWarn(null)}>
            {t.notices.back}
          </button>
        </span>
      </div>
    )
    // Not suggested any more: the main answer records nothing; recording it anyway warns first (FR-003)
    if (outdated && asTold && told) {
      return (
        <>
          {told.note && (
            <span className="transfer-status">
              <small className="notice-note">“{told.note}”</small>
            </span>
          )}
          <span className="transfer-actions">
            <button
              type="button"
              className="btn-secondary"
              aria-describedby={textId}
              data-action="decline"
              disabled={busy || card.state === 'paying' || !known}
              onClick={() => onDecline?.(asTold)}
            >
              {t.notices.skip}
            </button>
            <button
              type="button"
              className="btn-ghost"
              aria-describedby={textId}
              data-action="pay"
              disabled={busy || card.state === 'paying' || !known || warn !== null}
              onClick={() => record(asTold.amount)}
            >
              {card.state === 'paying' ? t.verdict.paying : t.notices.recordAnyway}
            </button>
          </span>
          {warning}
        </>
      )
    }
    return (
      <>
        {asTold ? (
          <span className="transfer-status">
            <small id={statusId}>
              {t.verdict.toldMe(from)} <Money amount={asTold.amount} />
              {asTold.amount !== transfer.amount && t.verdict.receiverCurrent(from, <Money amount={transfer.amount} />)}
            </small>
            {told.note && <small className="notice-note">“{told.note}”</small>}
          </span>
        ) : (
          declined && (
            <span className="transfer-status">
              <small>{t.verdict.youDeclined(from)}</small>
            </span>
          )
        )}
        {warning}
        <span className="transfer-actions">
          <button
            type="button"
            className="btn-secondary"
            // Told: the status line carries the amount that Đã nhận records
            aria-describedby={told ? `${textId} ${statusId}` : textId}
            data-action="pay"
            disabled={card.state === 'paying' || busy || !known}
            onClick={() => (asTold && told ? record(asTold.amount) : onPaid(transfer))}
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
              ref={partOpener}
              type="button"
              className="btn-ghost"
              aria-describedby={`${textId} ${statusId}`}
              aria-expanded={partOpen}
              data-action="receive-other"
              disabled={busy || card.state === 'paying'}
              onClick={() => {
                if (partOpen) onPartDraft(null)
                setPartOpen(!partOpen)
              }}
            >
              {t.verdict.receiveOther}
            </button>
          )}
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
        {asTold && told && partOpen && (
          <NoticeAmountStep
            label={t.verdict.receivedLabel}
            initial={partDraft?.amount ?? asTold.amount}
            max={asTold.amount}
            maxMessage={t.verdict.overTold}
            hint={t.verdict.atMost(formatVND(asTold.amount))}
            submitLabel={t.verdict.recordThis}
            busy={card.state === 'paying' || busy || partDraft?.sending === true}
            serverProblem={partDraft?.problem ?? null}
            onSubmit={(amount) => {
              const warnFor = (now: number) =>
                now === 0
                  ? t.notices.warnUnmatched(from, formatVND(amount))
                  : t.notices.warnOver(from, formatVND(now), formatVND(amount), formatVND(amount - now))
              // Above the suggestion: warned inside the step first; the same amount again records it (FR-004)
              const warned = partDraft?.amount === amount ? partDraft.warned : undefined
              if (amount > suggestion && warned === undefined) {
                onPartDraft({ amount, problem: warnFor(suggestion), sending: false, warned: suggestion })
                return
              }
              // Open until it is recorded; a refusal or no answer is said inside the step (FR-009, FR-016)
              onPartDraft({ amount, problem: null, sending: true })
              onPaid({ ...asTold, amount }, { version: told.version, warned }, (outcome) =>
                onPartDraft(
                  outcome.kind === 'done'
                    ? null
                    : outcome.kind === 'warn'
                      ? { amount, problem: warnFor(outcome.suggestion), sending: false, warned: outcome.suggestion }
                      : { amount, problem: outcome.line, sending: false },
                ),
              )
            }}
            onCancel={() => {
              onPartDraft(null)
              setPartOpen(false)
              partOpener.current?.focus()
            }}
          />
        )}
      </>
    )
  }

  if (transfer.from_member_id === me) {
    // The action is under the block (DebtorAction): the row keeps where it stands, no second button
    if (actionless) {
      return (
        <span className="transfer-status">
          <small>
            {told ? (
              // The same amounts as the block above (specs/019, FR-013)
              told.amount < transfer.amount ? (
                t.notices.rowPartial(<Money amount={told.amount} />, <Money amount={transfer.amount - told.amount} />, to)
              ) : (
                t.verdict.toldWaiting(to)
              )
            ) : declined ? (
              t.verdict.declinedBy(to)
            ) : (
              t.verdict.debtorRowHint(to)
            )}
          </small>
        </span>
      )
    }
    if (told) {
      return (
        <>
          {/* Not suggested any more: the card's own line says it (specs/019, FR-002) */}
          {(!outdated || told.note) && (
            <span className="transfer-status">
              {!outdated && <small>{t.verdict.toldWaiting(to)}</small>}
              {told.note && <small className="notice-note">“{told.note}”</small>}
            </span>
          )}
          <span className="transfer-actions">{cancel}</span>
        </>
      )
    }
    // Declined, and not suggested any more: the card's line says why (FR-004a); only to take back
    if (outdated) {
      return <span className="transfer-actions">{cancel}</span>
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

  // Someone else's notice that is not suggested any more: the card's line is all there is to say
  if (outdated) return null
  return (
    <span className="transfer-status">
      <small>{told ? t.verdict.toldOthers(from, to) : t.verdict.notPaidYet}</small>
    </span>
  )
}

export default VerdictBlock
