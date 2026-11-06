import type { Expense, Member, RecurringItem } from '../api/types'

/**
 * Recurring expenses (specs/007-recurring-expenses): what is due this month, worked out in the page from
 * the active items and the expenses already loaded. The server holds "one expense per item and month";
 * this only decides what to suggest. Pure.
 */

export type MonthState = 'recorded' | 'due' | 'later'

/** The day an item falls on in a month ("YYYY-MM"): its day, or the month's last day when shorter. */
export function dueDay(day: number, month: string): number {
  const [year, number] = month.split('-').map(Number)
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate()
  return Math.min(day, last)
}

/**
 * This month (of `today`, "YYYY-MM-DD") for one item: recorded if an expense of that month is linked to
 * it, due once its day has come, otherwise later.
 */
export function monthState(item: RecurringItem, expenses: Expense[], today: string): MonthState {
  const month = today.slice(0, 7)
  if (expenses.some((e) => e.recurring_item_id === item.id && e.spent_at.slice(0, 7) === month)) return 'recorded'
  return Number(today.slice(8, 10)) >= dueDay(item.day, month) ? 'due' : 'later'
}

/** The active items due this month, by day then oldest first. */
export function dueItems(items: RecurringItem[], expenses: Expense[], today: string): RecurringItem[] {
  return items
    .filter((item) => monthState(item, expenses, today) === 'due')
    .sort((a, b) => a.day - b.day || a.id - b.id)
}

export interface KeptPeople {
  /** The item's payer if they still have an account in the house, else null (the form asks). */
  payerId: number | null
  /** The item's people who still have an account in the house, in the item's order. */
  memberIds: number[]
  /** Everyone left out (payer included), to say so in the form. */
  left: number[]
}

/**
 * Who can still be in the filled form: members with an account in the house now (role set), as the server
 * allows for a new expense. Nobody's share moves silently: the form names who was left out.
 */
export function keptPeople(item: RecurringItem, members: Member[]): KeptPeople {
  // The same test as Chi tiêu's withAccount: a name nobody took has role null
  const here = new Set(members.filter((m) => m.role !== null).map((m) => m.id))
  const memberIds = item.member_ids.filter((id) => here.has(id))
  const payerId = here.has(item.payer_id) ? item.payer_id : null
  const left = [...new Set([...item.member_ids, item.payer_id].filter((id) => !here.has(id)))]
  return { payerId, memberIds, left }
}
