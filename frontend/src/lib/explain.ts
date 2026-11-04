import type { Expense, MemberBalance, Notice, Settlement } from '../api/types'

/**
 * "Vì sao ra số này?" (specs/002-balance-explanation): how one person's balance is made, from data the
 * page already has. The four totals are the balance's own (the API's net = paid − owed + sent −
 * received), so they always add up to the number shown everywhere else; the items behind each line
 * come from the expenses and repayments. Pure: no React, no request.
 */

export type LineKind = 'spent' | 'share' | 'paidBack' | 'gotBack'

export interface ExpenseItem {
  kind: 'expense'
  expenseId: number
  description: string
  spentAt: string
  payerId: number
  /** The whole expense. */
  amount: number
  /** What counts for this person: the whole amount under "spent", their share under "share". */
  part: number
}

export interface RepaymentItem {
  kind: 'repayment'
  settlementId: number
  settledAt: string
  otherMemberId: number
  amount: number
  note: string | null
}

export interface ExplanationLine {
  kind: LineKind
  /** Whole đồng, ≥ 0; the sign comes from the kind (+ spent and paidBack, − share and gotBack). */
  total: number
  /** Newest first. */
  items: (ExpenseItem | RepaymentItem)[]
  /** The items add up to the total; false for a moment when one request refreshed before the other. */
  inStep: boolean
}

/** A "Tôi đã chuyển" still waiting: not a repayment yet, so in no total (docs/ACCOUNTS.md S3). */
export interface WaitingNotice {
  otherMemberId: number
  amount: number
  /** This person told the other one; otherwise the other one told this person. */
  iSent: boolean
}

export interface BalanceExplanation {
  memberId: number
  /** spent, share, paidBack, gotBack, always in this order. */
  lines: ExplanationLine[]
  net: number
  waiting: WaitingNotice[]
}

// Newest first; on the same day the one recorded later (higher id) first
const newest = <T>(date: (item: T) => string, id: (item: T) => number) => (a: T, b: T) =>
  date(b).localeCompare(date(a)) || id(b) - id(a)

export function explain(
  balance: MemberBalance,
  expenses: Expense[],
  settlements: Settlement[],
  notices: Notice[],
): BalanceExplanation {
  const me = balance.member_id
  const byExpense = newest<Expense>((e) => e.spent_at, (e) => e.id)
  const bySettlement = newest<Settlement>((s) => s.settled_at, (s) => s.id)
  const expenseItem = (e: Expense, part: number): ExpenseItem => ({
    kind: 'expense',
    expenseId: e.id,
    description: e.description,
    spentAt: e.spent_at,
    payerId: e.payer_id,
    amount: e.amount,
    part,
  })
  const repaymentItem = (s: Settlement, otherMemberId: number): RepaymentItem => ({
    kind: 'repayment',
    settlementId: s.id,
    settledAt: s.settled_at,
    otherMemberId,
    amount: s.amount,
    note: s.note,
  })

  const spent = [...expenses].sort(byExpense).filter((e) => e.payer_id === me).map((e) => expenseItem(e, e.amount))
  // A 0 đồng share is no part of the balance, so it is not listed
  const share = [...expenses]
    .sort(byExpense)
    .flatMap((e) => e.shares.filter((s) => s.member_id === me && s.amount > 0).map((s) => expenseItem(e, s.amount)))
  const sorted = [...settlements].sort(bySettlement)
  const paidBack = sorted.filter((s) => s.from_member_id === me).map((s) => repaymentItem(s, s.to_member_id))
  const gotBack = sorted.filter((s) => s.to_member_id === me).map((s) => repaymentItem(s, s.from_member_id))

  // The total is the balance's; the items show only while they add up to it (research R2)
  const line = (kind: LineKind, total: number, items: (ExpenseItem | RepaymentItem)[]): ExplanationLine => {
    const sum = items.reduce((acc, item) => acc + (item.kind === 'expense' ? item.part : item.amount), 0)
    return { kind, total, items, inStep: sum === total }
  }
  const lines = [
    line('spent', balance.paid, spent),
    line('share', balance.owed, share),
    line('paidBack', balance.sent, paidBack),
    line('gotBack', balance.received, gotBack),
  ]
  const waiting = notices
    .filter((n) => n.status === 'sent' && (n.from_member_id === me || n.to_member_id === me))
    .map((n) => ({
      otherMemberId: n.from_member_id === me ? n.to_member_id : n.from_member_id,
      amount: n.amount,
      iSent: n.from_member_id === me,
    }))
  return {
    memberId: me,
    lines,
    net: balance.paid - balance.owed + balance.sent - balance.received,
    waiting,
  }
}
