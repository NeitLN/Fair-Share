import type { Expense, Member } from '../api/types'
import { REMOVED_MEMBER } from './names'

const NEEDS_QUOTES = /[",\r\n]/

/**
 * Rows as RFC 4180 CSV: cells joined by ",", rows by CRLF, no CRLF at the end. A cell with a comma,
 * a quote, CR or LF is wrapped in quotes and its quotes are doubled. Numbers are written as-is.
 */
export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell)
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

  const rows: (string | number)[][] = [
    ['Ngày', 'Nội dung', 'Số tiền (đồng)', 'Người trả', 'Cách chia', ...columns.map((c) => c.name)],
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
      expense.split_type === 'equal' ? 'chia đều' : 'chia riêng',
      ...columns.map((column) => shares.get(column.id) ?? ''),
    ])
  }
  return toCsv(rows)
}

/**
 * A name as part of a file name: "Nhà trọ Q7" → "nha-tro-q7" (bỏ dấu, chữ thường, mọi chuỗi không
 * phải a-z0-9 thành "-"), and "nha" when nothing is left.
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
