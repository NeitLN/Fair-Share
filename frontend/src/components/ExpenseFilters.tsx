import type { Member } from '../api/types'
import { isFiltered, monthLabel, NO_FILTER } from '../lib/expenseFilters'
import type { ExpenseFilter } from '../lib/expenseFilters'

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
  return (
    <div className="expense-filters" role="group" aria-label="Lọc khoản chi">
      <div className="filter-field">
        <label htmlFor="filter-month">Tháng</label>
        <select
          id="filter-month"
          value={filter.month ?? ''}
          onChange={(e) => onChange({ ...filter, month: e.target.value || null })}
        >
          <option value="">Tất cả</option>
          {months.map((month) => (
            <option key={month} value={month}>
              {monthLabel(month)}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-field">
        <label htmlFor="filter-member">Người</label>
        <select
          id="filter-member"
          value={filter.memberId ?? ''}
          onChange={(e) => onChange({ ...filter, memberId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Cả nhà</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </div>
      {isFiltered(filter) && (
        <button type="button" className="ghost" onClick={() => onChange(NO_FILTER)}>
          Bỏ lọc
        </button>
      )}
    </div>
  )
}

export default ExpenseFilters
