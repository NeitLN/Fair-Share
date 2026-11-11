import type { Notice, Settlement, Transfer } from '../api/types'

/**
 * How a notice stands against the household's suggestions right now (specs/019, FR-001): matched (the
 * suggestion covers it), over (part of it is above the suggestion) or unmatched (nothing is suggested
 * from the debtor to the receiver). Decided from the suggestions only, never from which cards exist.
 */
export type NoticeFit = { kind: 'matched' | 'over' | 'unmatched'; suggestion: number; excess: number }

export function classify(notice: Pick<Notice, 'from_member_id' | 'to_member_id' | 'amount'>, suggested: Transfer[]): NoticeFit {
  const match = suggested.find(
    (t) => t.from_member_id === notice.from_member_id && t.to_member_id === notice.to_member_id,
  )
  if (!match) return { kind: 'unmatched', suggestion: 0, excess: notice.amount }
  if (match.amount >= notice.amount) return { kind: 'matched', suggestion: match.amount, excess: 0 }
  return { kind: 'over', suggestion: match.amount, excess: notice.amount - match.amount }
}

/** What a page showed when a notice action was pressed, to tell afterwards what changed (FR-020). */
export interface RaceSnapshot {
  notice: Pick<Notice, 'version' | 'status' | 'amount'> | null
  settlementIds: Set<number>
}

export function snapshot(notice: Notice | undefined, settlements: Settlement[] | undefined): RaceSnapshot {
  return {
    notice: notice ? { version: notice.version, status: notice.status, amount: notice.amount } : null,
    settlementIds: new Set((settlements ?? []).map((s) => s.id)),
  }
}

/**
 * Which of the race lines the fresh data proves (specs/019, US4): the notice was declined, the receiver
 * recorded it (a repayment from the debtor to the receiver that took notice money appeared since the
 * press), it was taken back, or "something changed".
 */
export type Race =
  | { kind: 'declined'; amount: number }
  | { kind: 'confirmed'; amount: number }
  | { kind: 'takenBack' }
  | { kind: 'changed' }

export function raceOf(
  before: RaceSnapshot,
  pair: { from: number; to: number },
  notice: Notice | undefined,
  settlements: Settlement[],
): Race {
  if (notice?.status === 'declined' && before.notice?.status !== 'declined') {
    return { kind: 'declined', amount: notice.amount }
  }
  if (notice) return { kind: 'changed' }
  const recorded = settlements.filter(
    (s) =>
      !before.settlementIds.has(s.id) &&
      s.from_member_id === pair.from &&
      s.to_member_id === pair.to &&
      (s.notice_amount ?? 0) > 0,
  )
  if (recorded.length === 1) return { kind: 'confirmed', amount: recorded[0].amount }
  if (recorded.length === 0 && before.notice !== null) return { kind: 'takenBack' }
  return { kind: 'changed' }
}
