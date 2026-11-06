import type { Expense, Member, Settlement } from '../api/types'

/**
 * "Mới ghi" (specs/006-recently-added): the expenses and repayments other accounts saved since this
 * member last marked them as seen in this browser. Not an activity log: edits, deletions and "Tôi đã
 * chuyển" notices are not in it. Pure, apart from readMarks / writeMarks.
 */

/** The latest saved time marked as seen, per list (research R3). null: nothing marked in that list. */
export interface SeenMarks {
  expenses: string | null
  settlements: string | null
}

export interface RecentItem {
  kind: 'expense' | 'repayment'
  id: number
  /** savedKey(created_at): compares exactly, newest last. */
  savedKey: string
  /** The server's created_at, for showing the time. */
  savedAt: string
  /** The member whose account saved it; null when that account is no longer in the house. */
  recorderMemberId: number | null
  amount: number
  /** Expense only. */
  description?: string
  /** Repayment only: who paid it. */
  fromMemberId?: number
}

const FIRST_VISIT_MS = 7 * 24 * 60 * 60 * 1000
const STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?$/

/**
 * "2026-11-05T19:33:16.279230Z" → "2026-11-05T19:33:16.279230", UTC with six fraction digits, so keys
 * compare as strings at the server's full precision (research R2). The raw strings do not: the server
 * leaves out a zero fraction ("…:16Z"), and "." sorts before "Z". Date would keep milliseconds only.
 */
export function savedKey(createdAt: string): string {
  const match = STAMP.exec(createdAt)
  if (!match) return createdAt
  const [, whole, fraction = '', zone = 'Z'] = match
  const micro = fraction.padEnd(6, '0').slice(0, 6)
  if (zone === 'Z' || zone === '+00:00' || zone === '-00:00') return `${whole}.${micro}`
  // Another zone: move the whole seconds to UTC; the fraction does not change
  const utc = new Date(`${whole}${zone}`).toISOString().slice(0, 19)
  return `${utc}.${micro}`
}

/** Newest first; at the same instant repayments before expenses, then the higher id: stable. */
function newestFirst(a: RecentItem, b: RecentItem): number {
  if (a.savedKey !== b.savedKey) return a.savedKey < b.savedKey ? 1 : -1
  if (a.kind !== b.kind) return a.kind === 'repayment' ? -1 : 1
  return b.id - a.id
}

/**
 * What to list (data-model.md rules 1–4): records saved by another account (not mine, not from before
 * accounts), strictly after the mark of their own list, or, with no marks stored, in the last 7 days.
 */
export function recentItems(
  expenses: Expense[],
  settlements: Settlement[],
  members: Member[],
  myUserId: number,
  marks: SeenMarks | null,
  now: Date,
): RecentItem[] {
  const memberOf = new Map<number, number>()
  for (const member of members) if (typeof member.user_id === 'number') memberOf.set(member.user_id, member.id)
  const byOther = (createdBy: number | null | undefined): createdBy is number =>
    typeof createdBy === 'number' && createdBy !== myUserId
  const isNew = (createdAt: string, key: string, mark: string | null | undefined) =>
    marks === null ? now.getTime() - Date.parse(createdAt) <= FIRST_VISIT_MS : mark === null || key > (mark ?? '')

  const items: RecentItem[] = []
  for (const expense of expenses) {
    if (!byOther(expense.created_by)) continue
    const key = savedKey(expense.created_at)
    if (!isNew(expense.created_at, key, marks?.expenses)) continue
    items.push({
      kind: 'expense',
      id: expense.id,
      savedKey: key,
      savedAt: expense.created_at,
      recorderMemberId: memberOf.get(expense.created_by) ?? null,
      amount: expense.amount,
      description: expense.description,
    })
  }
  for (const settlement of settlements) {
    if (!byOther(settlement.created_by)) continue
    const key = savedKey(settlement.created_at)
    if (!isNew(settlement.created_at, key, marks?.settlements)) continue
    items.push({
      kind: 'repayment',
      id: settlement.id,
      savedKey: key,
      savedAt: settlement.created_at,
      recorderMemberId: memberOf.get(settlement.created_by) ?? null,
      amount: settlement.amount,
      fromMemberId: settlement.from_member_id,
    })
  }
  return items.sort(newestFirst)
}

function latest(keys: string[], previous: string | null): string | null {
  let best = previous
  for (const key of keys) if (best === null || key > best) best = key
  return best
}

/**
 * The marks after "Đánh dấu đã xem hết" (rule 5): per list, the latest saved time among the records the strip
 * was built from (own ones included: they are never listed anyway), and never earlier than before.
 */
export function marksAfter(expenses: Expense[], settlements: Settlement[], previous: SeenMarks | null): SeenMarks {
  return {
    expenses: latest(expenses.map((e) => savedKey(e.created_at)), previous?.expenses ?? null),
    settlements: latest(settlements.map((s) => savedKey(s.created_at)), previous?.settlements ?? null),
  }
}

const marksKey = (userId: number, householdId: number) => `fair-share:seen:${userId}:${householdId}`
const isMark = (value: unknown) => value === null || typeof value === 'string'

/** This account's marks for this house in this browser; null when none are stored or they cannot be read. */
export function readMarks(userId: number, householdId: number): SeenMarks | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(marksKey(userId, householdId)) ?? 'null')
    if (saved && typeof saved === 'object' && 'expenses' in saved && 'settlements' in saved) {
      const { expenses, settlements } = saved as Record<string, unknown>
      if (isMark(expenses) && isMark(settlements)) return { expenses, settlements } as SeenMarks
    }
  } catch {
    // Blocked or broken storage: as if nothing was marked
  }
  return null
}

/** Keeps the marks in this browser; a blocked storage only loses them on reload (FR-011). */
export function writeMarks(userId: number, householdId: number, marks: SeenMarks): void {
  try {
    localStorage.setItem(marksKey(userId, householdId), JSON.stringify(marks))
  } catch {
    // The page keeps the marks in its state for this visit
  }
}
