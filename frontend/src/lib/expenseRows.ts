// How an expense row reads, shared by the phone list and the computer table (components/ExpenseList,
// ExpenseTable) and Khoản chi gần đây
import type { Expense } from '../api/types'
import { messages } from '../i18n'

/**
 * "chia đều 4 người", "chia riêng 2 người", and "chia đều 3/4 người" only when the people sharing are
 * some of today's members. Members come and go, so an old expense is compared by who, not by how many.
 */
export function splitText(expense: Expense, memberIds: Set<number>): string {
  const t = messages().expenses
  const people = expense.shares.length
  if (expense.split_type === 'custom') return t.splitCustom(people)
  const someOfToday =
    people < memberIds.size && expense.shares.every((share) => memberIds.has(share.member_id))
  return someOfToday ? t.splitEqualOf(people, memberIds.size) : t.splitEqual(people)
}

const instant = (timestamp: string) => Date.parse(timestamp) || 0

/** Newest day first; inside a day, the one entered last first. */
export function byDay(expenses: Expense[]): [string, Expense[]][] {
  const sorted = [...expenses].sort(
    (a, b) =>
      b.spent_at.slice(0, 10).localeCompare(a.spent_at.slice(0, 10)) ||
      instant(b.created_at) - instant(a.created_at) ||
      b.id - a.id,
  )
  const days = new Map<string, Expense[]>()
  for (const expense of sorted) {
    const day = expense.spent_at.slice(0, 10)
    days.set(day, [...(days.get(day) ?? []), expense])
  }
  return [...days]
}
