import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { ApiError } from '../api/client'
import { keys } from '../api/households'
import { refreshIfUnknown } from '../api/queryClient'
import { acceptNotice, balancesFetchCount, createSettlement, deleteSettlement } from '../api/settlements'
import type { Balances, Transfer } from '../api/types'
import { messages } from '../i18n'
import { today } from './date'
import { errorMessage } from './errors'
import { formatVND } from './money'
import { isUnknown, outcomeLine } from './saveOutcome'
import { useSaveFeedback, useToast } from './toast'

/** One transfer card in the verdict block, as the block shows it. */
export interface TransferCard {
  /** "open-<from>-<to>" for a suggestion, "pay-<id>" for a press of Đã trả. Stable for React and focus. */
  key: string
  transfer: Transfer
  /** open: "Đã trả"; paying: being recorded; paid: stamped, can be undone; undoing: being deleted. */
  state: 'open' | 'paying' | 'paid' | 'undoing'
  /** The press behind a paying, paid or undoing card. */
  paymentId?: number
}

/** Where keyboard focus should go once the card it follows changes (see VerdictBlock). */
export interface FocusIntent {
  card: string
  /** "undo": that card's Hoàn tác once it is enabled. "gone": the block's heading once the card is gone. */
  then: 'undo' | 'gone'
}

// One press of "Đã trả", from the request to the undo. Kept apart from the suggestions, which are
// refetched (and lose the paid transfer) after it is recorded.
interface Payment {
  id: number
  /** What was pressed, as it was then: the card shows this, not a refetched amount. */
  transfer: Transfer
  state: 'paying' | 'paid' | 'undoing'
  settlementId: number | null
  /** Balances fetched up to this count were asked for before the payment existed. */
  recordedAtFetch: number
}

/** The receiver's answer to a notice: its version, and the suggestion they were warned about (specs/019). */
export interface ToldAnswer {
  version: number
  /** Set after the over-suggestion warning: the suggestion it named (0: none), checked by the server. */
  warned?: number
  /** The server asks for that warning first (409 warning_required): the card shows it, not an error. */
  onWarn?: (suggestion: number) => void
}

/** How a recording ended, for a card or step that waits for it (specs/018, FR-009; specs/019, FR-006). */
export type PayOutcome = { kind: 'done' } | { kind: 'problem'; line: string } | { kind: 'warn'; suggestion: number }

const pairKey = (t: Transfer) => `${t.from_member_id}-${t.to_member_id}`

/**
 * "Đã trả", the ĐÃ TRẢ stamp and Hoàn tác (DESIGN.md §6.2). Each press keeps its own card, built from
 * what was pressed, until it is undone or its settlement deleted. A suggestion for the same pair stays
 * hidden until balances fetched after the payment arrive, so the paid transfer can never be pressed
 * twice; a new debt between the same two people shows up once those balances say so. Hoàn tác deletes
 * exactly the settlement that press created. The hook belongs to one household: the page remounts it
 * for another one, and nothing from a request that finishes later reaches the screen.
 */
export function usePaidTransfers(
  householdId: number,
  balances: Balances | undefined,
  /** "Bạn trả Minh": how the toasts name a transfer, read when each toast is shown. */
  describe: (transfer: Transfer) => string,
) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const feedback = useSaveFeedback()
  const [payments, setPayments] = useState<Payment[]>([])
  const [error, setError] = useState<string | null>(null)
  const nextId = useRef(1)
  const alive = useRef(true)
  const describeNow = useRef(describe)
  const intent = useRef<FocusIntent | null>(null)
  // Synchronous guards: state is not visible to a second click in the same tick
  const recording = useRef(new Set<string>())
  const undoing = useRef(new Set<number>())
  const finished = useRef(new Set<number>())
  const deletedSettlements = useRef(new Set<number>())
  const dismissers = useRef(new Set<() => void>())
  // The "Đã ghi … Hoàn tác" toast of each payment: undoing it from its card takes the toast away too,
  // so no dead Hoàn tác is left on screen
  const toastOf = useRef(new Map<number, () => void>())
  // The order cards were last shown in, by key. A press takes the place of the suggestion it replaces,
  // so stamped cards stay where they were whatever order they are paid or answered in.
  const [layout, setLayout] = useState<string[]>([])

  useEffect(() => {
    describeNow.current = describe
  })

  // Leaving the household: its toasts and their actions go with it
  useEffect(() => {
    alive.current = true
    const open = dismissers.current
    return () => {
      alive.current = false
      open.forEach((dismiss) => dismiss())
      open.clear()
    }
  }, [])

  const say = (
    text: string,
    action?: { label: string; onAction: () => void },
    sticky?: boolean,
    success?: { source: string },
  ) => {
    if (!alive.current) return undefined
    const dismiss = toast({
      text,
      action,
      sticky,
      kind: success ? 'success' : undefined,
      source: success?.source,
      // Gone by any way (timed out, pushed out, acted on): nothing to take away on unmount
      onGone: action && (() => dismissers.current.delete(dismiss)),
    })
    if (action) dismissers.current.add(dismiss)
    return dismiss
  }
  const named = (transfer: Transfer) => `${describeNow.current(transfer)} ${formatVND(transfer.amount)}`
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.household(householdId) })
  const change = (id: number, next: Partial<Payment> | null) => {
    if (!alive.current) return
    setPayments((current) =>
      next === null ? current.filter((p) => p.id !== id) : current.map((p) => (p.id === id ? { ...p, ...next } : p)),
    )
  }

  /**
   * Records `transfer`; returns the new card's payment id (null when this pair is already being recorded).
   * `told`: the receiver's "Đã nhận" on a "Tôi đã chuyển" notice of that version, for `transfer.amount`
   * (all of it, or part with "Nhận số khác"), which records it and takes it out of the notice in one go,
   * once however many times it is pressed (docs/ACCOUNTS.md, S3; specs/014).
   */
  function pay(transfer: Transfer, told?: ToldAnswer, onDone?: (outcome: PayOutcome) => void): number | null {
    const pair = pairKey(transfer)
    if (recording.current.has(pair)) return null
    recording.current.add(pair)
    feedback.started(`transfer-${pair}`)
    const id = nextId.current++
    setError(null)
    setPayments((current) => [
      ...current,
      {
        id,
        transfer,
        state: 'paying',
        settlementId: null,
        recordedAtFetch: Number.POSITIVE_INFINITY,
      },
    ])
    intent.current = { card: `pay-${id}`, then: 'undo' }
    // Applied to the latest layout, so two presses in one batch both keep their place; cards the user
    // saw that the layout has not caught up with are merged in, never put in its place
    setLayout((current) =>
      arrange(current, shown.map((c) => c.key)).map((key) => (key === `open-${pair}` ? `pay-${id}` : key)),
    )
    void record(id, transfer, pair, told, onDone)
    return id
  }

  /**
   * `onDone`: told how it ended (null: recorded; else the line to show), for a step that keeps what was
   * typed until the money is recorded ("Nhận số khác", specs/018, FR-009); its error is said there, not
   * in the panel.
   */
  async function record(
    id: number,
    transfer: Transfer,
    pair: string,
    told?: ToldAnswer,
    onDone?: (outcome: PayOutcome) => void,
  ) {
    try {
      const settlement = told
        ? await acceptNotice(householdId, transfer.from_member_id, {
            version: told.version,
            received: transfer.amount,
            settledAt: today(),
            warnedSuggestion: told.warned,
          })
        : await createSettlement(householdId, { ...transfer, settled_at: today() })
      if (deletedSettlements.current.has(settlement.id)) {
        // Deleted from Lịch sử trả before this answer arrived: nothing to stamp or undo
        change(id, null)
      } else {
        change(id, { state: 'paid', settlementId: settlement.id, recordedAtFetch: balancesFetchCount() })
        const dismiss = say(
          messages().paid.recorded(named(transfer)),
          { label: messages().common.undo, onAction: () => undo(id, settlement.id, transfer) },
          false,
          { source: `transfer-${pair}` },
        )
        if (dismiss) toastOf.current.set(id, dismiss)
      }
      onDone?.({ kind: 'done' })
      void refresh()
    } catch (failure) {
      change(id, null)
      // More than is suggested now, and not warned yet: the card shows the warning (specs/019, FR-006)
      const warning = failure instanceof ApiError && failure.code === 'warning_required'
      if (warning && (told?.onWarn || onDone)) {
        const suggestion = (failure.details as { suggestion?: number } | undefined)?.suggestion ?? 0
        if (told?.onWarn) told.onWarn(suggestion)
        else onDone?.({ kind: 'warn', suggestion })
        void refresh()
        return
      }
      // Not sent, or sent with no answer: said in those words (specs/018, A5)
      const line = outcomeLine('A5', failure, messages()) ?? errorMessage(failure)
      if (onDone) onDone({ kind: 'problem', line: line ?? messages().common.tryAgain })
      else if (alive.current) setError(line)
      // Refused (the notice changed since), or no answer at all (it may have been recorded): what is on
      // screen may be old, so the notices and balances are read again before anything else is pressed
      void refresh()
      refreshIfUnknown(failure, householdId)
    } finally {
      recording.current.delete(pair)
    }
  }

  async function undo(id: number, settlementId: number, transfer: Transfer) {
    if (undoing.current.has(id) || finished.current.has(id)) return
    undoing.current.add(id)
    toastOf.current.get(id)?.()
    toastOf.current.delete(id)
    intent.current = { card: `pay-${id}`, then: 'gone' }
    change(id, { state: 'undoing' })
    try {
      await deleteSettlement(settlementId, householdId)
      finished.current.add(id)
      deletedSettlements.current.add(settlementId)
      change(id, null)
      say(messages().paid.undone(named(transfer)))
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 404) {
        // Deleted already (from Lịch sử trả, or on another phone): nothing left to undo
        finished.current.add(id)
        change(id, null)
        say(messages().paid.alreadyDeleted)
      } else {
        change(id, { state: 'paid' })
        // Offline or unknown has its own line, never after "Couldn't undo." (specs/018, A6, FR-016a). An
        // unknown one stays until closed or used, so its warning is not lost (FR-015)
        const line = outcomeLine('A6', failure, messages())
        say(
          line ?? messages().paid.undoFailed(errorMessage(failure) ?? ''),
          { label: messages().common.tryAgain, onAction: () => undo(id, settlementId, transfer) },
          isUnknown(failure),
        )
        refreshIfUnknown(failure, householdId)
      }
    } finally {
      undoing.current.delete(id)
      void refresh()
    }
  }

  // A suggestion is still the paid transfer itself until balances asked for after the payment arrive.
  // Balances whose request is unknown count as old: a paid transfer stays hidden rather than payable twice
  const fetched = balances?.fetchCount ?? Number.NEGATIVE_INFINITY
  const consumed = new Set(
    payments
      .filter((p) => p.state === 'paying' || fetched <= p.recordedAtFetch)
      .map((p) => pairKey(p.transfer)),
  )
  const outstanding = (balances?.suggested ?? []).filter((t) => !consumed.has(pairKey(t)))
  // What the verdict sentence counts: the suggestions as the server last gave them. A payment only moves
  // it once balances asked for after it arrive, so the block never says "Cả nhà sạch nợ" for a pair paid
  // in part, nor before the server has the payment (specs/014, FR-011)
  const owed = balances?.suggested ?? []

  // Every card on screen: the open suggestions and each press, built from what was pressed
  const byKey = new Map<string, TransferCard>()
  for (const transfer of outstanding) {
    const key = `open-${pairKey(transfer)}`
    byKey.set(key, { key, transfer, state: 'open' })
  }
  for (const p of payments) {
    byKey.set(`pay-${p.id}`, { key: `pay-${p.id}`, transfer: p.transfer, state: p.state, paymentId: p.id })
  }
  const cards = arrange(layout, outstanding.map((t) => `open-${pairKey(t)}`)).filter((key) => byKey.has(key))
  for (const key of byKey.keys()) if (!cards.includes(key)) cards.push(key)
  const shown = cards.map((key) => byKey.get(key) as TransferCard)
  // Remember this order for the next render; arranging it again gives the same order, so this settles
  if (cards.length !== layout.length || cards.some((key, i) => key !== layout[i])) setLayout(cards)

  return {
    cards: shown,
    /** Repayments whose stamped card still offers Hoàn tác: their history row offers no Xoá (specs/019, FR-016). */
    undoable: new Set(
      payments.filter((p) => p.state === 'paid' && p.settlementId !== null).map((p) => p.settlementId as number),
    ),
    /** The suggestions still to pay, without the ones being recorded: the cards and the reminder. */
    outstanding,
    /** The same, but a payment still being recorded counts as owed: the verdict sentence and total. */
    owed,
    /** Recording a transfer failed. */
    error,
    pay,
    undo(paymentId: number) {
      const payment = payments.find((p) => p.id === paymentId)
      if (payment?.settlementId != null) undo(payment.id, payment.settlementId, payment.transfer)
    },
    /** The settlement was deleted from Lịch sử trả: its card goes, there is nothing to undo. */
    forget(settlementId: number) {
      deletedSettlements.current.add(settlementId)
      setPayments((current) => current.filter((p) => p.settlementId !== settlementId))
    },
    /** The focus move the block should make after this render, if any; it clears it once done. */
    focusIntent: () => intent.current,
    clearFocusIntent: () => {
      intent.current = null
    },
  }
}

/**
 * The keys in the order last shown, plus the missing ones from `keys`, each placed after the key that
 * comes before it there (or first). Keys no longer on screen are dropped by the caller.
 */
function arrange(previous: string[], keys: string[]): string[] {
  const order = [...previous]
  keys.forEach((key, index) => {
    if (order.includes(key)) return
    const after = keys.slice(0, index).reverse().find((k) => order.includes(k))
    order.splice(after === undefined ? 0 : order.indexOf(after) + 1, 0, key)
  })
  return order
}
