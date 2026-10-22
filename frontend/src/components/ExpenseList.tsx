import { useMemo } from 'react'

import type { Expense, Member } from '../api/types'
import { dayLabel } from '../lib/date'
import { memberLooks, REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { Avatar } from './Avatar'
import { Chip } from './Chip'
import { Money } from './Money'
import ErrorNote from './ErrorNote'
import Skeleton from './Skeleton'
import { closeFoldOnEscape } from '../lib/fold'

interface ExpenseListProps {
  expenses: Expense[]
  members: Member[]
  /** How each member is shown (lib/names.ts); worked out from `members` when not given. */
  looks?: Map<number, MemberLook>
  loading: boolean
  error: string | null
  /** Reloads after a failed load; shows Thử lại next to the error. */
  onRetry?: () => void
  /** The reload is running: Thử lại is disabled. */
  retrying?: boolean
  onEdit: (expense: Expense) => void
  onDelete: (expense: Expense) => void
  /** The expense being deleted right now: its buttons are disabled so a double click sends one request. */
  deletingId?: number | null
}

/**
 * "chia đều 4 người", "chia riêng 2 người", and "chia đều 3/4 người" only when the people sharing are
 * some of today's members. Members come and go, so an old expense is compared by who, not by how many.
 */
function splitText(expense: Expense, memberIds: Set<number>): string {
  const people = expense.shares.length
  if (expense.split_type === 'custom') return `chia riêng ${people} người`
  const someOfToday =
    people < memberIds.size && expense.shares.every((share) => memberIds.has(share.member_id))
  return someOfToday ? `chia đều ${people}/${memberIds.size} người` : `chia đều ${people} người`
}

const instant = (timestamp: string) => Date.parse(timestamp) || 0

/** Newest day first; inside a day, the one entered last first. */
function byDay(expenses: Expense[]): [string, Expense[]][] {
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

/**
 * "Các khoản chi" (DESIGN.md §6.3): grouped by day, each row a <details> that reveals Sửa and Xoá when
 * tapped. Props only; the page does the API calls.
 */
function ExpenseList({
  expenses,
  members,
  looks: givenLooks,
  loading,
  error,
  onRetry,
  retrying = false,
  onEdit,
  onDelete,
  deletingId = null,
}: ExpenseListProps) {
  const looks = useMemo(() => givenLooks ?? memberLooks(members), [givenLooks, members])
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members])

  if (loading) {
    return <Skeleton label="Đang tải danh sách khoản chi" />
  }

  const lookOf = (id: number) => looks.get(id) ?? REMOVED_MEMBER

  // Deleting cannot be undone from the UI, so ask first
  function confirmDelete(expense: Expense) {
    if (window.confirm(`Xoá khoản "${expense.description}"?`)) onDelete(expense)
  }

  return (
    <div className="expense-days">
      {error && <ErrorNote message={error} onRetry={onRetry} retrying={retrying} />}
      {/* An empty list after an error means "could not load", not "no expenses" */}
      {expenses.length === 0 ? (
        !error && <p className="empty">Chưa có khoản chi nào. Ghi khoản đầu tiên ở trên.</p>
      ) : (
        byDay(expenses).map(([day, items]) => (
          <section key={day} className="expense-day" aria-labelledby={`expense-day-${day}`}>
            <h3 id={`expense-day-${day}`} className="expense-day-title">
              {dayLabel(day)}
            </h3>
            <ul className="expense-list">
              {items.map((expense) => {
                const deleting = deletingId === expense.id
                const payer = lookOf(expense.payer_id)
                return (
                  <li key={expense.id} className="expense-row">
                    <details onKeyDown={closeFoldOnEscape}>
                      <summary>
                        <Avatar look={payer} decorative />
                        <span className="expense-main">
                          <span className="expense-description">
                            {expense.description}
                            {expense.source === 'ai' && <Chip kind="ai">✦ AI</Chip>}
                          </span>
                          <small>
                            {payer.short} trả · {splitText(expense, memberIds)}
                          </small>
                        </span>
                        <Money amount={expense.amount} className="expense-amount" />
                      </summary>
                      <div className="expense-actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          aria-label={`Sửa ${expense.description}`}
                          disabled={deleting}
                          onClick={() => onEdit(expense)}
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="btn-danger"
                          aria-label={`Xoá ${expense.description}`}
                          disabled={deleting}
                          onClick={() => confirmDelete(expense)}
                        >
                          {deleting ? 'Đang xoá…' : 'Xoá'}
                        </button>
                      </div>
                    </details>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

export default ExpenseList
