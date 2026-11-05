import type { Expense, Member, MemberBalance, Settlement } from '../api/types'

/**
 * "Báo cáo tháng" (specs/004-monthly-report): for one month, where each housemate stood before it,
 * what moved in it and where they stand after it. Built from the expenses (with their shares) and the
 * confirmed repayments the app already loads, with the server's rule
 * net = paid − share + paid back − got back (app/services/balances.py), cut by date. Nothing is stored;
 * "Tôi đã chuyển" notices are not read, so they change nothing (ACCOUNTS.md S3). Pure: no React, no I/O.
 */

/** "YYYY-MM". Months compare as strings. */
export type Month = string

export interface MonthRange {
  /** The earliest month of any expense or repayment, or the current month if that is earlier. */
  first: Month
  /** The later of the current month and the latest month of any expense or repayment. */
  last: Month
}

export interface ReportLine {
  memberId: number
  /** The balance from everything dated before the month. */
  start: number
  /** Expenses in the month this member paid for. */
  paid: number
  /** This member's shares of the month's expenses. */
  share: number
  /** Repayments in the month this member sent. */
  paidBack: number
  /** Repayments in the month this member received. */
  gotBack: number
  /** start + paid − share + paidBack − gotBack. */
  end: number
}

export interface MonthReport {
  month: Month
  /** Every expense of the month added up; equal to the sum of `paid` and of `share`. */
  total: number
  /** Today's members in their order, then anyone who left but appears in an item, by id. */
  lines: ReportLine[]
  /** No expense and no repayment in the month. */
  empty: boolean
  /** The month is the current one and something is dated after it. */
  laterItems: boolean
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/** "2026-11" is a month; "2026-13", "2026-1" and "abc" are not. */
export const isMonth = (value: string) => MONTH.test(value)

const expenseMonth = (expense: Expense): Month => expense.spent_at.slice(0, 7)
const settlementMonth = (settlement: Settlement): Month => settlement.settled_at.slice(0, 7)

function itemMonths(expenses: Expense[], settlements: Settlement[]): Month[] {
  return [...expenses.map(expenseMonth), ...settlements.map(settlementMonth)]
}

export function monthRange(expenses: Expense[], settlements: Settlement[], current: Month): MonthRange {
  let first = current
  let last = current
  for (const month of itemMonths(expenses, settlements)) {
    if (month < first) first = month
    if (month > last) last = month
  }
  return { first, last }
}

/**
 * The month an address asks for, made safe: none is the current month, one outside the range goes to the
 * nearer end, and anything that is not a month goes to the last (research R3).
 */
export function clampMonth(wanted: string | undefined, range: MonthRange, current: Month): Month {
  if (wanted === undefined) return current
  if (!isMonth(wanted) || wanted > range.last) return range.last
  if (wanted < range.first) return range.first
  return wanted
}

export function shiftMonth(month: Month, by: number): Month {
  const [year, number] = month.split('-').map(Number)
  const index = year * 12 + (number - 1) + by
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

export function monthReport(
  month: Month,
  expenses: Expense[],
  settlements: Settlement[],
  members: Member[],
  current: Month,
): MonthReport {
  const byMember = new Map<number, ReportLine>()
  const line = (memberId: number) => {
    let found = byMember.get(memberId)
    if (!found) {
      found = { memberId, start: 0, paid: 0, share: 0, paidBack: 0, gotBack: 0, end: 0 }
      byMember.set(memberId, found)
    }
    return found
  }
  for (const member of members) line(member.id)

  let total = 0
  let empty = true
  let later = false
  for (const expense of expenses) {
    const when = expenseMonth(expense)
    if (when > month) {
      later = true
      // Still gives someone who appears only later a line, so every month lists the same people
      line(expense.payer_id)
      for (const share of expense.shares) line(share.member_id)
    } else if (when < month) {
      line(expense.payer_id).start += expense.amount
      for (const share of expense.shares) line(share.member_id).start -= share.amount
    } else {
      empty = false
      total += expense.amount
      line(expense.payer_id).paid += expense.amount
      for (const share of expense.shares) line(share.member_id).share += share.amount
    }
  }
  for (const settlement of settlements) {
    const when = settlementMonth(settlement)
    const from = line(settlement.from_member_id)
    const to = line(settlement.to_member_id)
    if (when > month) {
      later = true
    } else if (when < month) {
      from.start += settlement.amount
      to.start -= settlement.amount
    } else {
      empty = false
      from.paidBack += settlement.amount
      to.gotBack += settlement.amount
    }
  }
  for (const l of byMember.values()) l.end = l.start + l.paid - l.share + l.paidBack - l.gotBack

  const today = new Set(members.map((m) => m.id))
  const gone = [...byMember.keys()].filter((id) => !today.has(id)).sort((a, b) => a - b)
  return {
    month,
    total,
    lines: [...members.map((m) => m.id), ...gone].map((id) => byMember.get(id) as ReportLine),
    empty,
    laterItems: later && month === current,
  }
}

/**
 * Whether a report of the last month in range ends exactly on the balances the API returns (research
 * R2). The queries refresh one by one, so for a moment they can disagree; the page then waits.
 */
export function inStep(report: MonthReport, balances: MemberBalance[]): boolean {
  const net = new Map(balances.map((b) => [b.member_id, b.net]))
  const lined = new Set(report.lines.map((l) => l.memberId))
  return (
    report.lines.every((l) => l.end === (net.get(l.memberId) ?? 0)) &&
    balances.every((b) => lined.has(b.member_id) || b.net === 0)
  )
}
