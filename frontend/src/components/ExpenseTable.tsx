import { Fragment, useMemo, useState } from 'react'

import type { Expense, Member } from '../api/types'
import { dayLabel } from '../lib/date'
import { byDay, splitAndCategory } from '../lib/expenseRows'
import { useWideTable } from '../lib/useWide'
import { useClampedDescriptions } from '../lib/useClamped'
import { memberLooks, REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { Avatar } from './Avatar'
import { Chip } from './Chip'
import ErrorNote from './ErrorNote'
import { Money } from './Money'
import ShareList from './ShareList'
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
 * 1407 px the date and the payer move under the description (CSS), so nothing is hidden or squeezed.
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
  // A row's description opens a row with each share (design review 05/11). The share cell spans the
  // columns from the description to Số tiền, which are two fewer below 1408 px (date and payer fold away)
  const allColumns = useWideTable()
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  function toggle(id: number) {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  // A description cut by the two lines gets Xem đủ, for that row only (spec 012, US5)
  const { clamped, ref: descriptionRef } = useClampedDescriptions(expenses)
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())
  function toggleExpanded(id: number) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
                const split = splitAndCategory(expense, memberIds)
                const sharesOpen = open.has(expense.id)
                return (
                  <Fragment key={expense.id}>
                    <tr
                      data-expense={expense.id}
                      className={
                        [
                          editingId === expense.id && 'editing',
                          highlightId === expense.id && 'just-saved',
                          expanded.has(expense.id) && 'expanded',
                        ]
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                    >
                      <td className="col-date">{dayLabel(day)}</td>
                      <td className="col-description">
                        {/* Opens the row of shares, like tapping a row on a phone; the description and not the
                            split under the payer, because 1024–1407 px folds the payer column away */}
                        <span className="expense-description-cell">
                          <button
                            type="button"
                            className="expense-open"
                            aria-expanded={sharesOpen}
                            aria-controls={`shares-${expense.id}`}
                            onClick={() => toggle(expense.id)}
                          >
                            <span
                              className={`expense-description${expanded.has(expense.id) ? ' expanded' : ''}`}
                              title={expense.description}
                            >
                              <span className="expense-description-text" ref={descriptionRef(expense.id)}>
                                {expense.description}
                              </span>
                              {expense.source === 'ai' && <Chip kind="ai">✦ AI</Chip>}
                            </span>
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
                          </button>
                          {clamped.has(expense.id) && (
                            <button
                              type="button"
                              className="expense-show-full"
                              aria-expanded={expanded.has(expense.id)}
                              onClick={() => toggleExpanded(expense.id)}
                            >
                              {expanded.has(expense.id) ? t.expenses.showLess : t.expenses.showFull}
                            </button>
                          )}
                        </span>
                        {/* 1024–1407 px: the columns below fold into this line */}
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
                    {sharesOpen && (
                      // Over description, payer and amount, so each share ends where Số tiền ends (review of #193)
                      <tr id={`shares-${expense.id}`} className="share-row">
                        <td className="col-date" />
                        <td colSpan={allColumns ? 3 : 2}>
                          <ShareList expense={expense} looks={looks} />
                        </td>
                        <td />
                      </tr>
                    )}
                  </Fragment>
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
