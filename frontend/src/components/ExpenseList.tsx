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
import { byDay, splitText } from '../lib/expenseRows'
import { useT } from '../i18n'

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
  /** Whether Sửa and Xoá are offered: the owner, or whoever recorded it (docs/ACCOUNTS.md). */
  canChange?: (expense: Expense) => boolean
  /** The expense just saved and asked for ("Xem" in the toast): tinted for a moment. */
  highlightId?: number | null
}

const always = () => true

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
  canChange = always,
  highlightId = null,
}: ExpenseListProps) {
  const t = useT()
  const looks = useMemo(() => givenLooks ?? memberLooks(members), [givenLooks, members])
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members])

  if (loading) {
    return <Skeleton label={t.expenses.loadingList} />
  }

  const lookOf = (id: number) => looks.get(id) ?? REMOVED_MEMBER

  // Deleting cannot be undone from the UI, so ask first
  function confirmDelete(expense: Expense) {
    if (window.confirm(t.expenses.confirmDelete(expense.description))) onDelete(expense)
  }

  return (
    <div className="expense-days">
      {error && <ErrorNote message={error} onRetry={onRetry} retrying={retrying} />}
      {/* An empty list after an error means "could not load", not "no expenses" */}
      {expenses.length === 0 ? (
        !error && <p className="empty">{t.expenses.empty}</p>
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
                  <li
                    key={expense.id}
                    data-expense={expense.id}
                    className={`expense-row${highlightId === expense.id ? ' just-saved' : ''}`}
                  >
                    {/* Only a row the user may change opens; the others are plain rows (no hint of a
                        menu that would be empty) */}
                    {canChange(expense) ? (
                      <details onKeyDown={closeFoldOnEscape}>
                        <summary>
                          <Avatar look={payer} decorative />
                          <span className="expense-main">
                            <span className="expense-description">
                              {expense.description}
                              {expense.source === 'ai' && <Chip kind="ai">✦ AI</Chip>}
                            </span>
                            <small>
                              {t.expenses.paidBy(payer.short, splitText(expense, memberIds))}
                            </small>
                          </span>
                          <Money amount={expense.amount} className="expense-amount" />
                          <svg className="row-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                            <path
                              d="M6 3.5 10.5 8 6 12.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </summary>
                        <div className="expense-actions">
                          <button
                            type="button"
                            className="btn-secondary"
                            aria-label={t.expenses.editLabel(expense.description)}
                            disabled={deleting}
                            onClick={() => onEdit(expense)}
                          >
                            {t.common.edit}
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
                            aria-label={t.expenses.deleteLabel(expense.description)}
                            disabled={deleting}
                            onClick={() => confirmDelete(expense)}
                          >
                            {deleting ? t.common.deleting : t.common.delete}
                          </button>
                        </div>
                      </details>
                    ) : (
                      <div className="expense-summary">
                        <Avatar look={payer} decorative />
                        <span className="expense-main">
                          <span className="expense-description">
                            {expense.description}
                            {expense.source === 'ai' && <Chip kind="ai">✦ AI</Chip>}
                          </span>
                          <small>
                            {t.expenses.paidBy(payer.short, splitText(expense, memberIds))}
                          </small>
                        </span>
                        <Money amount={expense.amount} className="expense-amount" />
                      </div>
                    )}
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
