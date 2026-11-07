import type { Category, Expense, Member } from '../api/types'
import { language, messages } from '../i18n'

/**
 * Chi tiêu filters (PROJECT_SPEC §3.4): by month and by member, and each member's total for a month.
 * Worked out from the expenses already loaded; the API is not asked for anything more.
 */

export interface ExpenseFilter {
  /** "YYYY-MM", or null for every month. */
  month: string | null
  /** The member who paid the expense, or null for every payer. Paid by, not "involved": nearly every
   * expense is shared by the whole house, so "involved" left the list almost unchanged (owner, 07/11). */
  memberId: number | null
  /** What the expenses were for (specs/005-expense-categories), or null for any. */
  category: Category | null
}

export const NO_FILTER: ExpenseFilter = { month: null, memberId: null, category: null }

/** "2026-10" for an expense spent on 2026-10-22. */
export const monthOf = (expense: Expense) => expense.spent_at.slice(0, 7)

/** Every month that has an expense, newest first. */
export function monthsOf(expenses: Expense[]): string[] {
  return [...new Set(expenses.map(monthOf))].sort((a, b) => b.localeCompare(a))
}

/** "10/2026": short enough for a select at 360 px, where the field's label already says Tháng. */
export function monthNumber(month: string): string {
  const [year, number] = month.split('-')
  if (language() === 'en') return `${SHORT_MONTHS[Number(number) - 1]} ${year}`
  return `${Number(number)}/${year}`
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Tháng 10/2026". */
export const monthLabel = (month: string) => messages().filters.monthLabel(monthNumber(month))


export function filterExpenses(expenses: Expense[], filter: ExpenseFilter): Expense[] {
  return expenses.filter(
    (expense) =>
      (filter.month === null || monthOf(expense) === filter.month) &&
      (filter.memberId === null || expense.payer_id === filter.memberId) &&
      (filter.category === null || (expense.category ?? 'other') === filter.category),
  )
}

export function isFiltered(filter: ExpenseFilter): boolean {
  return filter.month !== null || filter.memberId !== null || filter.category !== null
}

export interface MemberTotal {
  memberId: number
  /** What this member paid for the household, in đồng. */
  paid: number
  /** This member's part of the expenses they shared in, in đồng. */
  share: number
}

export interface MonthTotals {
  /** Every expense of the month added up, in đồng; equal to the sum of `share` and of `paid`. */
  total: number
  /** Today's members in their order, then anyone who has left but still appears, by id. */
  members: MemberTotal[]
}

/** Who paid what and whose share was what, over the expenses given (usually one month's). */
export function monthTotals(expenses: Expense[], members: Member[]): MonthTotals {
  const byMember = new Map<number, MemberTotal>()
  const row = (memberId: number) => {
    let found = byMember.get(memberId)
    if (!found) {
      found = { memberId, paid: 0, share: 0 }
      byMember.set(memberId, found)
    }
    return found
  }
  for (const member of members) row(member.id)

  let total = 0
  for (const expense of expenses) {
    total += expense.amount
    row(expense.payer_id).paid += expense.amount
    for (const share of expense.shares) row(share.member_id).share += share.amount
  }

  const current = new Set(members.map((m) => m.id))
  const gone = [...byMember.keys()].filter((id) => !current.has(id)).sort((a, b) => a - b)
  return {
    total,
    members: [...members.map((m) => m.id), ...gone].map((id) => byMember.get(id) as MemberTotal),
  }
}
