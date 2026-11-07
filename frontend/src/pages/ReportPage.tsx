import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { expenseKeys, listExpenses } from '../api/expenses'
import { keys, listMembers } from '../api/households'
import { getBalances, listSettlements, settlementKeys } from '../api/settlements'
import { Avatar } from '../components/Avatar'
import { Chip } from '../components/Chip'
import CategoryChart from '../components/CategoryChart'
import ErrorNote from '../components/ErrorNote'
import { Money } from '../components/Money'
import Skeleton from '../components/Skeleton'
import { today } from '../lib/date'
import { errorMessage } from '../lib/errors'
import { categoryTotals } from '../lib/categories'
import { monthLabel, monthOf } from '../lib/expenseFilters'
import { useMe } from '../lib/identity'
import { clampMonth, inStep, isMonth, monthRange, monthReport, shiftMonth } from '../lib/monthReport'
import type { MonthReport, ReportLine } from '../lib/monthReport'
import { memberLooks, REMOVED_MEMBER } from '../lib/names'
import { useMemberPhotos } from '../lib/useMemberPhotos'
import type { MemberLook } from '../lib/names'
import { useWide } from '../lib/useWide'
import { useT } from '../i18n'

/**
 * "Báo cáo tháng" (specs/004-monthly-report): one month, read only. Start + what moved = end for each
 * housemate, worked out from the cached expenses and repayments (lib/monthReport.ts). The last month
 * must end on the balances the API returns; until it does the page waits (research R2).
 */
function ReportPage() {
  const householdId = Number(useParams().householdId)
  const wanted = useParams().month
  const navigate = useNavigate()
  const t = useT()
  const { me } = useMe()
  const wide = useWide()

  // The same queries as Tổng quan: served from its cache when coming from there
  const members = useQuery({ queryKey: keys.members(householdId), queryFn: () => listMembers(householdId) })
  const expenses = useQuery({ queryKey: expenseKeys.list(householdId), queryFn: () => listExpenses(householdId) })
  const settlements = useQuery({
    queryKey: settlementKeys.list(householdId),
    queryFn: () => listSettlements(householdId),
  })
  const balances = useQuery({
    queryKey: settlementKeys.balances(householdId),
    queryFn: () => getBalances(householdId),
  })
  const queries = [members, expenses, settlements, balances]
  const loaded = members.isSuccess && expenses.isSuccess && settlements.isSuccess && balances.isSuccess
  const failed = queries.find((q) => q.isError)

  const current = today().slice(0, 7)
  const range = loaded ? monthRange(expenses.data, settlements.data, current) : null
  // Until the data is in, the month in the address is shown as asked (if it is a month at all)
  const month = range ? clampMonth(wanted, range, current) : wanted !== undefined && isMonth(wanted) ? wanted : current
  const label = monthLabel(month)

  // A missing or impossible month in the address becomes the one shown, without a new history entry
  useEffect(() => {
    if (loaded && wanted !== month) navigate(`/households/${householdId}/report/${month}`, { replace: true })
  }, [loaded, wanted, month, householdId, navigate])

  const report = useMemo(
    () => (loaded ? monthReport(month, expenses.data, settlements.data, members.data, current) : null),
    [loaded, month, expenses.data, settlements.data, members.data, current],
  )
  const photos = useMemberPhotos(householdId, members.data)
  const looks = useMemo(() => memberLooks(members.data ?? [], photos), [members.data, photos])
  const waiting = report !== null && range !== null && month === range.last && !inStep(report, balances.data!.balances)

  // Out of step: one of the queries is older than the others; ask all of them again, once per mismatch
  const { refetch: refetchExpenses } = expenses
  const { refetch: refetchSettlements } = settlements
  const { refetch: refetchBalances } = balances
  useEffect(() => {
    if (!waiting) return
    void refetchExpenses()
    void refetchSettlements()
    void refetchBalances()
  }, [waiting, refetchExpenses, refetchSettlements, refetchBalances])

  const monthPath = (m: string) => `/households/${householdId}/report/${m}`

  return (
    <section className="report" aria-labelledby="report-title">
      <div className="report-head">
        <h2 id="report-title">{t.report.title(label)}</h2>
        {range && (
          <nav className="report-steps" aria-label={t.filters.month}>
            {month > range.first && (
              <Link
                className="btn-secondary report-step"
                to={monthPath(shiftMonth(month, -1))}
                aria-label={t.report.previous(monthLabel(shiftMonth(month, -1)))}
              >
                ‹ <span aria-hidden="true">{monthLabel(shiftMonth(month, -1))}</span>
              </Link>
            )}
            {month < range.last && (
              <Link
                className="btn-secondary report-step"
                to={monthPath(shiftMonth(month, 1))}
                aria-label={t.report.next(monthLabel(shiftMonth(month, 1)))}
              >
                <span aria-hidden="true">{monthLabel(shiftMonth(month, 1))}</span> ›
              </Link>
            )}
          </nav>
        )}
      </div>

      {failed ? (
        <ErrorNote
          message={errorMessage(failed.error) ?? ''}
          onRetry={() => queries.filter((q) => q.isError).forEach((q) => void q.refetch())}
          retrying={queries.some((q) => q.isFetching)}
        />
      ) : !report ? (
        <Skeleton label={t.report.loading} rows={4} />
      ) : waiting ? (
        <p className="hint" role="status">
          {t.report.updating}
        </p>
      ) : (
        <>
          <p className="report-total">
            {t.report.total} <Money amount={report.total} />
          </p>
          {report.empty && <p className="hint">{t.report.empty}</p>}
          {report.laterItems && <p className="hint">{t.report.laterItems}</p>}
          {wide ? (
            <ReportTable report={report} label={label} looks={looks} me={me} />
          ) : (
            <ReportCards report={report} label={label} looks={looks} me={me} />
          )}
          <p className="hint">{t.report.note}</p>
          {/* Where the month's money went (specs/005-expense-categories); nothing for an empty month */}
          <CategoryChart
            totals={categoryTotals((expenses.data ?? []).filter((expense) => monthOf(expense) === month))}
            month={month}
            householdId={householdId}
          />
          <Link className="section-link" to={`/households/${householdId}/expenses`} state={{ month }}>
            {t.report.seeExpenses}
          </Link>
        </>
      )}
    </section>
  )
}

interface ViewProps {
  report: MonthReport
  label: string
  looks: Map<number, MemberLook>
  me: number | null
}

function Who({ line, looks, me }: { line: ReportLine; looks: Map<number, MemberLook>; me: number | null }) {
  const t = useT()
  const look = looks.get(line.memberId) ?? REMOVED_MEMBER
  return (
    <span className="report-who">
      <Avatar look={look} decorative />
      <strong>{look.short}</strong>
      {me === line.memberId && <Chip kind="me">{t.common.you}</Chip>}
    </span>
  )
}

/** On a computer: one row per housemate and a total row (research R5). */
function ReportTable({ report, label, looks, me }: ViewProps) {
  const t = useT()
  const c = t.report.columns
  const sum = (pick: (l: ReportLine) => number) => report.lines.reduce((total, l) => total + pick(l), 0)
  return (
    <table className="report-table">
      <caption className="visually-hidden">{t.report.caption(label)}</caption>
      <thead>
        <tr>
          <th scope="col">{c.who}</th>
          <th scope="col">{c.start}</th>
          <th scope="col">{c.paid}</th>
          <th scope="col">{c.share}</th>
          <th scope="col">{c.paidBack}</th>
          <th scope="col">{c.gotBack}</th>
          <th scope="col">{c.end}</th>
        </tr>
      </thead>
      <tbody>
        {report.lines.map((line) => (
          <tr key={line.memberId} className={me === line.memberId ? 'highlighted' : undefined}>
            <th scope="row">
              <Who line={line} looks={looks} me={me} />
            </th>
            <td>
              <Money amount={line.start} kind="balance" />
            </td>
            <td>
              <Money amount={line.paid} />
            </td>
            <td>
              <Money amount={line.share} />
            </td>
            <td>
              <Money amount={line.paidBack} />
            </td>
            <td>
              <Money amount={line.gotBack} />
            </td>
            <td>
              <Money amount={line.end} kind="balance" />
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">{t.report.totalRow}</th>
          <td>
            <Money amount={sum((l) => l.start)} kind="balance" />
          </td>
          <td>
            <Money amount={sum((l) => l.paid)} />
          </td>
          <td>
            <Money amount={sum((l) => l.share)} />
          </td>
          <td>
            <Money amount={sum((l) => l.paidBack)} />
          </td>
          <td>
            <Money amount={sum((l) => l.gotBack)} />
          </td>
          <td>
            <Money amount={sum((l) => l.end)} kind="balance" />
          </td>
        </tr>
      </tfoot>
    </table>
  )
}

/** On a phone: one card per housemate, the six figures as a list (research R5). */
function ReportCards({ report, label, looks, me }: ViewProps) {
  const t = useT()
  const c = t.report.columns
  return (
    <ul className="report-cards" aria-label={t.report.caption(label)}>
      {report.lines.map((line) => (
        <li key={line.memberId} className={`report-card${me === line.memberId ? ' highlighted' : ''}`}>
          <Who line={line} looks={looks} me={me} />
          <dl>
            <dt>{c.start}</dt>
            <dd>
              <Money amount={line.start} kind="balance" />
            </dd>
            <dt>{c.paid}</dt>
            <dd>
              <Money amount={line.paid} />
            </dd>
            <dt>{c.share}</dt>
            <dd>
              <Money amount={line.share} />
            </dd>
            <dt>{c.paidBack}</dt>
            <dd>
              <Money amount={line.paidBack} />
            </dd>
            <dt>{c.gotBack}</dt>
            <dd>
              <Money amount={line.gotBack} />
            </dd>
            <dt className="report-end">{c.end}</dt>
            <dd className="report-end">
              <Money amount={line.end} kind="balance" />
            </dd>
          </dl>
        </li>
      ))}
    </ul>
  )
}

export default ReportPage
