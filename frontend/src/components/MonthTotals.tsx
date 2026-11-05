import { Link } from 'react-router'

import { monthLabel } from '../lib/expenseFilters'
import type { MonthTotals as Totals } from '../lib/expenseFilters'
import { REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { Avatar } from './Avatar'
import { Chip } from './Chip'
import { Money } from './Money'
import { useT } from '../i18n'

interface MonthTotalsProps {
  /** "YYYY-MM". */
  month: string
  totals: Totals
  looks: Map<number, MemberLook>
  me?: number | null
  /** The member the list is filtered on: their row is marked. */
  highlight?: number | null
  /** h3 under Chi tiêu's list; h2 on Tổng quan, where it is a section of its own. */
  level?: 2 | 3
  /** Where "Báo cáo tháng" goes (specs/004-monthly-report); Tổng quan passes it, Chi tiêu does not. */
  reportTo?: string
}

/**
 * "Tổng tháng" (PROJECT_SPEC §3.4): what the household spent in a month, and for each member what they
 * paid and what their share was. Paid minus share is how far the month moved them. Props only.
 */
function MonthTotals({ month, totals, looks, me = null, highlight = null, level = 3, reportTo }: MonthTotalsProps) {
  const t = useT()
  const label = monthLabel(month)
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <section className="month-totals" aria-labelledby="month-totals-title">
      <Heading id="month-totals-title">
        {label}: {t.filters.monthTotal} <Money amount={totals.total} />
      </Heading>
      {reportTo && (
        <Link className="section-link" to={reportTo}>
          {t.report.open}
        </Link>
      )}
      <ul className="balance-list" aria-label={t.filters.eachPerson(label)}>
        {totals.members.map((row) => {
          const look = looks.get(row.memberId) ?? REMOVED_MEMBER
          return (
            <li
              key={row.memberId}
              className={`balance-row${highlight === row.memberId ? ' highlighted' : ''}`}
            >
              <Avatar look={look} decorative />
              <span className="who">
                <strong>
                  {look.short}
                  {me === row.memberId && <Chip kind="me">{t.common.you}</Chip>}
                </strong>
                <small>
                  {t.money.paid} <Money amount={row.paid} />
                </small>
              </span>
              <span className="standing">
                <Money amount={row.share} />
                <small>{t.money.share}</small>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default MonthTotals
