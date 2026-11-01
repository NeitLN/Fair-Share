import type { Expense, Member } from '../api/types'
import { messages } from '../i18n'
import { REMOVED_MEMBER } from './names'

const NEEDS_QUOTES = /[",\r\n]/
// A spreadsheet runs a cell that starts like this as a formula; anyone with the link can type one
const FORMULA_START = /^[=+\-@\t\r]/

/**
 * Rows as RFC 4180 CSV: cells joined by ",", rows by CRLF, no CRLF at the end. A cell with a comma,
 * a quote, CR or LF is wrapped in quotes and its quotes are doubled. Numbers are written as-is; text
 * that would start a formula ("=", "+", "-", "@", tab, CR) gets a leading "'".
 */
export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          // Numbers are ours; text is what someone typed, so a formula is shown, never run
          const text = typeof cell === 'string' && FORMULA_START.test(cell) ? `'${cell}` : String(cell)
          return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text
        })
        .join(','),
    )
    .join('\r\n')
}

/**
 * The expenses of one household as a CSV table: one row per expense, a column per member, so every
 * row adds up to the amount. Oldest day first; within a day, the lower id first.
 */
export function expensesCsv(expenses: Expense[], members: Member[]): string {
  const nameOf = new Map(members.map((member) => [member.id, member.name]))
  // Someone who is in a share but no longer in the household still has an amount to report
  const goneIds = [
    ...new Set(expenses.flatMap((expense) => expense.shares.map((share) => share.member_id))),
  ]
    .filter((id) => !nameOf.has(id))
    .sort((a, b) => a - b)
  const columns = [
    ...members.map((member) => ({ id: member.id, name: member.name })),
    ...goneIds.map((id) => ({ id, name: REMOVED_MEMBER.full })),
  ]

  const t = messages().csv
  const rows: (string | number)[][] = [
    [t.date, t.description, t.amount, t.paidBy, t.split, ...columns.map((c) => c.name)],
  ]
  const sorted = [...expenses].sort(
    (a, b) => a.spent_at.slice(0, 10).localeCompare(b.spent_at.slice(0, 10)) || a.id - b.id,
  )
  for (const expense of sorted) {
    const shares = new Map(expense.shares.map((share) => [share.member_id, share.amount]))
    rows.push([
      expense.spent_at.slice(0, 10),
      expense.description,
      expense.amount,
      nameOf.get(expense.payer_id) ?? REMOVED_MEMBER.full,
      expense.split_type === 'equal' ? t.equal : t.custom,
      ...columns.map((column) => shares.get(column.id) ?? ''),
    ])
  }
  return toCsv(rows)
}

/**
 * A name as part of a file name: "Nhà trọ Q7" → "nha-tro-q7" (no accents, lower case, every run of
 * other characters one "-"), and "nha" when nothing is left.
 */
export function fileSlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'nha'
}
