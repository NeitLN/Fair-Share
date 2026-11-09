import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type { Notice, ReceivingHint, Transfer } from '../api/types'
import { closeFoldOnEscape } from '../lib/fold'
import { formatVND } from '../lib/money'
import { MAX_AMOUNT } from '../lib/split'
import { REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import type { FocusIntent, TransferCard } from '../lib/usePaidTransfers'
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
  onPaid: (transfer: Transfer, told?: { version: number }) => void
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

  // "Vì sao ra số này?" from the line under the debtor's action: the same fold, opened and focused
  function openExplanation() {
    const fold = explainFold.current
    if (!fold) return
    fold.open = true
    fold.querySelector('summary')?.focus()
    fold.scrollIntoView?.({ block: 'nearest' })
  }

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
  const aboutMe = (card: TransferCard) =>
    me !== null && (card.transfer.from_member_id === me || card.transfer.to_member_id === me)
  const all = [...cards, ...leftOver]
  const mine = all.filter(aboutMe)
  const others = all.filter((card) => !aboutMe(card))
  const shown = [...mine, ...others]
  // The transfers you must make: their action is under the block, where the eye lands first (US2)
  const toTell = onlyReceiver && me !== null ? suggested.filter((t) => t.from_member_id === me) : []
  // Nothing to list and nothing to copy: no empty panel under the answer
  const hasPanel = Boolean((onlyReceiver && noticesError) || shown.length > 0 || error || suggested.length > 0)

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
            actionless={transfer.from_member_id === me && !card.key.startsWith('told-')}
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
            <p className="debtor-hint">
              {t.verdict.combinedHint}{' '}
              {explanation && (
                <button type="button" className="btn-ghost" onClick={openExplanation}>
                  {t.explain.open}
                </button>
              )}
            </p>
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
  const [qrOpen, setQrOpen] = useState(false)
  const covered = sent !== undefined && sent.amount >= current
  const closeQr = () => {
    setQrOpen(false)
    // Back to the opener; if a refresh took it away, the debtor's own action, then the verdict heading
    const target =
      (qrOpener.current?.isConnected ? qrOpener.current : null) ??
      root.current?.querySelector<HTMLButtonElement>('button:not(:disabled)') ??
      document.querySelector<HTMLElement>('.verdict-sentence')
    target?.focus()
  }
  const qrButton = qr?.hint && !covered && (
    <button
      ref={qrOpener}
      type="button"
      className="btn-ghost"
      data-action="open-qr"
      aria-expanded={qrOpen}
      onClick={() => setQrOpen((open) => !open)}
    >
      {t.verdict.qrOpen}
    </button>
  )
  const qrMore = qr && !covered && (
    qr.hint ? (
      qrOpen && (
        <PaymentQrPanel householdId={qr.householdId} memberId={transfer.to_member_id} to={to} onClose={closeQr} />
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
  onPaid: (transfer: Transfer, told?: { version: number }) => void
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
  const [partOpen, setPartOpen] = useState(false)
  const partOpener = useRef<HTMLButtonElement>(null)
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
              {t.verdict.toldMe(from)} <Money amount={asTold.amount} />
              {outdated
                ? t.verdict.receiverNotSuggested
                : asTold.amount !== transfer.amount && t.verdict.receiverCurrent(from, <Money amount={transfer.amount} />)}
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
        <span className="transfer-actions">
          <button
            type="button"
            className="btn-secondary"
            // Told: the status line carries the amount that Đã nhận records
            aria-describedby={told ? `${textId} ${statusId}` : textId}
            data-action="pay"
            disabled={card.state === 'paying' || busy || !known}
            onClick={() => (asTold && told ? onPaid(asTold, { version: told.version }) : onPaid(transfer))}
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
              onClick={() => setPartOpen((open) => !open)}
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
            initial={asTold.amount}
            max={asTold.amount}
            maxMessage={t.verdict.overTold}
            hint={t.verdict.atMost(formatVND(asTold.amount))}
            submitLabel={t.verdict.recordThis}
            busy={card.state === 'paying' || busy}
            onSubmit={(amount) => {
              setPartOpen(false)
              onPaid({ ...asTold, amount }, { version: told.version })
            }}
            onCancel={() => {
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
              <>
                {t.verdict.toldWaiting(to)}
                {outdated && <> {t.verdict.outdated}</>}
              </>
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
          <span className="transfer-status">
            <small>
              {outdated ? t.verdict.toldNotSuggested(<Money amount={told.amount} />, to) : t.verdict.toldWaiting(to)}
            </small>
            {told.note && <small className="notice-note">“{told.note}”</small>}
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
