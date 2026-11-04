import { useMemo } from 'react'
import { Link } from 'react-router'

import type { Expense, Member } from '../api/types'
import { dayLabel } from '../lib/date'
import { byDay, splitText } from '../lib/expenseRows'
import { REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { Avatar } from './Avatar'
import ErrorNote from './ErrorNote'
import { Money } from './Money'
import Skeleton from './Skeleton'
import { useT } from '../i18n'

const SHOWN = 5

interface RecentExpensesProps {
  /** The household's expenses, as the page already loads them for the month's total. */
  expenses: Expense[] | undefined
  members: Member[]
  looks: Map<number, MemberLook>
  loading: boolean
  error: string | null
  onRetry: () => void
  retrying: boolean
}

/**
 * "Khoản chi gần đây" under the balances on a computer (DESIGN.md §6.6): the last few expenses, so the
 * balances above can be explained without leaving Tổng quan. Reading only; Xem tất cả opens Chi tiêu.
 */
function RecentExpenses({ expenses, members, looks, loading, error, onRetry, retrying }: RecentExpensesProps) {
  const t = useT()
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members])
  const latest = useMemo(
    () => byDay(expenses ?? []).flatMap(([day, items]) => items.map((expense) => ({ day, expense }))).slice(0, SHOWN),
    [expenses],
  )

  return (
    <section aria-labelledby="recent-title">
      <div className="section-head">
        <h2 id="recent-title">{t.dashboard.recentTitle}</h2>
        <Link to="expenses" className="section-link">
          {t.dashboard.seeAll}
        </Link>
      </div>
      {loading ? (
        <Skeleton rows={3} label={t.expenses.loadingList} />
      ) : error ? (
        <ErrorNote message={error} onRetry={onRetry} retrying={retrying} />
      ) : latest.length === 0 ? (
        <p className="empty">{t.expenses.empty}</p>
      ) : (
        <ul className="recent-list">
          {latest.map(({ day, expense }) => {
            const payer = looks.get(expense.payer_id) ?? REMOVED_MEMBER
            return (
              <li key={expense.id} className="recent-row">
                <Avatar look={payer} size="sm" decorative />
                <span className="recent-main">
                  <span className="recent-description">{expense.description}</span>
                  <small>
                    {dayLabel(day)} · {t.expenses.paidBy(payer.short, splitText(expense, memberIds))}
                  </small>
                </span>
                <Money amount={expense.amount} className="recent-amount" />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default RecentExpenses
