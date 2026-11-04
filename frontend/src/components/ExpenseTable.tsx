import { useMemo } from 'react'

import type { Expense, Member } from '../api/types'
import { dayLabel } from '../lib/date'
import { byDay, splitText } from '../lib/expenseRows'
import { memberLooks, REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { Avatar } from './Avatar'
import { Chip } from './Chip'
import ErrorNote from './ErrorNote'
import { Money } from './Money'
import Skeleton from './Skeleton'
import { useT } from '../i18n'

interface ExpenseTableProps {
  expenses: Expense[]
  members: Member[]
  looks?: Map<number, MemberLook>
  loading: boolean
  error: string | null
  onRetry?: () => void
  retrying?: boolean
  onEdit: (expense: Expense) => void
  onDelete: (expense: Expense) => void
  deletingId?: number | null
  canChange?: (expense: Expense) => boolean
  /** The expense open in the form on the left: its row is marked. */
  editingId?: number | null
  /** The expense just saved and asked for ("Xem" in the toast): tinted for a moment. */
  highlightId?: number | null
}

const always = () => true

/**
 * "Các khoản chi" on a computer (DESIGN.md §6.6): the same expenses as ExpenseList, as a table to read
 * down the columns, newest first, with Sửa and Xoá on each row the user may change. Between 1024 and
 * 1279 px the date and the payer move under the description (CSS), so nothing is hidden or squeezed.
 */
function ExpenseTable({
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
  editingId = null,
  highlightId = null,
}: ExpenseTableProps) {
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
      {expenses.length === 0 ? (
        !error && <p className="empty">{t.expenses.empty}</p>
      ) : (
        <table className="expense-table">
          <thead>
            <tr>
              <th scope="col" className="col-date">
                {t.expenses.colDate}
              </th>
              <th scope="col">{t.expenses.colDescription}</th>
              <th scope="col" className="col-payer">
                {t.expenses.colPayer}
              </th>
              <th scope="col" className="col-amount">
                {t.expenses.colAmount}
              </th>
              <th scope="col" className="col-actions">
                <span className="visually-hidden">{t.expenses.colActions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {byDay(expenses).flatMap(([day, items]) =>
              items.map((expense) => {
                const deleting = deletingId === expense.id
                const payer = lookOf(expense.payer_id)
                const split = splitText(expense, memberIds)
                return (
                  <tr
                    key={expense.id}
                    data-expense={expense.id}
                    className={
                      [editingId === expense.id && 'editing', highlightId === expense.id && 'just-saved']
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                  >
                    <td className="col-date">{dayLabel(day)}</td>
                    <td className="col-description">
                      <span className="expense-description">
                        {expense.description}
                        {expense.source === 'ai' && <Chip kind="ai">✦ AI</Chip>}
                      </span>
                      {/* 1024–1279 px: the columns below fold into this line */}
                      <small className="expense-meta">
                        {dayLabel(day)} · {t.expenses.paidBy(payer.short, split)}
                      </small>
                    </td>
                    <td className="col-payer">
                      <span className="payer">
                        <Avatar look={payer} size="sm" decorative />
                        <span>
                          {payer.short}
                          <small>{split}</small>
                        </span>
                      </span>
                    </td>
                    <td className="col-amount">
                      <Money amount={expense.amount} className="expense-amount" />
                    </td>
                    <td className="col-actions">
                      {canChange(expense) && (
                        <span className="row-actions">
                          <button
                            type="button"
                            className="btn-ghost"
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
                        </span>
                      )}
                    </td>
                  </tr>
                )
              }),
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default ExpenseTable
