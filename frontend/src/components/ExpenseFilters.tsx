import type { Member } from '../api/types'
import { isFiltered, monthNumber, NO_FILTER } from '../lib/expenseFilters'
import type { ExpenseFilter } from '../lib/expenseFilters'
import { useT } from '../i18n'

interface ExpenseFiltersProps {
  /** The months that have an expense, newest first ("YYYY-MM"). */
  months: string[]
  members: Member[]
  filter: ExpenseFilter
  onChange: (filter: ExpenseFilter) => void
}

/**
 * "Lọc" above Các khoản chi (PROJECT_SPEC §3.4): a month and a member, and Bỏ lọc once either is set.
 * Props only; the page keeps the filter and filters the list.
 */
function ExpenseFilters({ months, members, filter, onChange }: ExpenseFiltersProps) {
  const t = useT()
  return (
    <div className="expense-filters" role="group" aria-label={t.filters.label}>
      <div className="filter-field">
        <label htmlFor="filter-month">{t.filters.month}</label>
        <select
          id="filter-month"
          value={filter.month ?? ''}
          onChange={(e) => onChange({ ...filter, month: e.target.value || null })}
        >
          <option value="">{t.filters.all}</option>
          {months.map((month) => (
            <option key={month} value={month}>
              {monthNumber(month)}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-field">
        <label htmlFor="filter-member">{t.filters.person}</label>
        <select
          id="filter-member"
          value={filter.memberId ?? ''}
          onChange={(e) => onChange({ ...filter, memberId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">{t.filters.everyone}</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </div>
      {isFiltered(filter) && (
        <button type="button" className="ghost" onClick={() => onChange(NO_FILTER)}>
          {t.filters.clear}
        </button>
      )}
    </div>
  )
}

export default ExpenseFilters
