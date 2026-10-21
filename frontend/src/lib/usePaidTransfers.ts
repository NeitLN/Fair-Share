import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { ApiError } from '../api/client'
import { keys } from '../api/households'
import { createSettlement, deleteSettlement } from '../api/settlements'
import type { Transfer } from '../api/types'
import { today } from './date'
import { errorMessage } from './errors'
import { formatVND } from './money'
import { useToast } from './toast'

/** One transfer card in the verdict block, as the block shows it. */
export interface TransferCard {
  /** Stable for React: the pair for an open suggestion, the payment for a recorded one. */
  key: string
  transfer: Transfer
  /** open: "Đã trả"; paying: being recorded; paid: stamped, can be undone; undoing: being deleted. */
  state: 'open' | 'paying' | 'paid' | 'undoing'
  /** The payment behind a paid card, for undoing it. */
  paymentId?: number
}

// One press of "Đã trả", from the request to the undo. Kept apart from the suggestions, which are
// refetched (and lose the paid transfer) as soon as it is recorded.
interface Payment {
  id: number
  transfer: Transfer
  /** Where its card was, so the stamped card stays in place. */
  index: number
  state: 'paying' | 'paid' | 'undoing'
  settlementId: number | null
}

const pairKey = (t: Transfer) => `${t.from_member_id}-${t.to_member_id}`

/**
 * "Đã trả", the ĐÃ TRẢ stamp and Hoàn tác (DESIGN.md §6.2). A recorded transfer keeps its card, stamped,
 * after the suggestions are refetched without it; Hoàn tác deletes exactly the settlement that press
 * created. A double click records once and an undo runs once.
 */
export function usePaidTransfers(
  householdId: number,
  suggested: Transfer[],
  /** "Bạn trả Minh": how the toasts name a transfer. */
  describe: (transfer: Transfer) => string,
) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [store, setStore] = useState<{ householdId: number; payments: Payment[] }>({ householdId, payments: [] })
  const [error, setError] = useState<string | null>(null)
  const nextId = useRef(1)
  // Synchronous guards: state updates are not visible to a second click in the same tick
  const recording = useRef(new Set<string>())
  const undoing = useRef(new Set<number>())
  const undone = useRef(new Set<number>())

  // Another household: its payments are not this one's
  let payments = store.payments
  if (store.householdId !== householdId) {
    payments = []
    setStore({ householdId, payments })
    setError(null)
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.household(householdId) })
  const change = (id: number, next: Partial<Payment> | null) =>
    setStore((current) => ({
      ...current,
      payments:
        next === null
          ? current.payments.filter((p) => p.id !== id)
          : current.payments.map((p) => (p.id === id ? { ...p, ...next } : p)),
    }))

  async function pay(transfer: Transfer, index: number) {
    const pair = pairKey(transfer)
    if (recording.current.has(pair)) return
    recording.current.add(pair)
    const id = nextId.current++
    setError(null)
    setStore((current) => ({
      ...current,
      payments: [...current.payments, { id, transfer, index, state: 'paying', settlementId: null }],
    }))
    try {
      const settlement = await createSettlement(householdId, { ...transfer, settled_at: today() })
      // Stamp the card once the new suggestions are in, so the paid transfer is never shown twice
      await refresh()
      change(id, { state: 'paid', settlementId: settlement.id })
      toast({
        text: `Đã ghi: ${describe(transfer)} ${formatVND(transfer.amount)}`,
        action: { label: 'Hoàn tác', onAction: () => undo(id, settlement.id, transfer) },
      })
    } catch (failure) {
      change(id, null)
      setError(errorMessage(failure))
    } finally {
      recording.current.delete(pair)
    }
  }

  async function undo(id: number, settlementId: number, transfer: Transfer) {
    if (undoing.current.has(id) || undone.current.has(id)) return
    undoing.current.add(id)
    change(id, { state: 'undoing' })
    try {
      await deleteSettlement(settlementId)
      undone.current.add(id)
      change(id, null)
      await refresh()
      toast({ text: `Đã hoàn tác: ${describe(transfer)} ${formatVND(transfer.amount)}` })
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 404) {
        // Deleted already (from Lịch sử trả, or on another phone): nothing left to undo
        undone.current.add(id)
        change(id, null)
        await refresh()
        toast({ text: 'Khoản trả này đã được xoá trước đó.' })
      } else {
        change(id, { state: 'paid' })
        toast({
          text: `Chưa hoàn tác được. ${errorMessage(failure)}`,
          action: { label: 'Thử lại', onAction: () => undo(id, settlementId, transfer) },
        })
      }
    } finally {
      undoing.current.delete(id)
    }
  }

  // The open suggestions, with the stamped cards put back where they were
  const busy = new Set(payments.filter((p) => p.state === 'paying').map((p) => pairKey(p.transfer)))
  const cards: TransferCard[] = suggested.map((transfer) => ({
    key: `open-${pairKey(transfer)}`,
    transfer,
    state: busy.has(pairKey(transfer)) ? 'paying' : 'open',
  }))
  for (const payment of payments.filter((p) => p.state !== 'paying').sort((a, b) => a.index - b.index)) {
    cards.splice(Math.min(payment.index, cards.length), 0, {
      key: `paid-${payment.id}`,
      transfer: payment.transfer,
      state: payment.state === 'undoing' ? 'undoing' : 'paid',
      paymentId: payment.id,
    })
  }

  return {
    cards,
    /** Recording a transfer failed. */
    error,
    pay,
    undo(paymentId: number) {
      const payment = payments.find((p) => p.id === paymentId)
      if (payment?.settlementId != null) undo(payment.id, payment.settlementId, payment.transfer)
    },
    /** The settlement was deleted from Lịch sử trả: its card goes, there is nothing to undo. */
    forget(settlementId: number) {
      setStore((current) => ({
        ...current,
        payments: current.payments.filter((p) => p.settlementId !== settlementId),
      }))
    },
  }
}
