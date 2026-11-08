import type { Category, Member } from '../api/types'
import { CATEGORIES } from '../lib/categories'
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
 * "Lọc" above Các khoản chi (PROJECT_SPEC §3.4): a month, a member and a category
 * (specs/005-expense-categories), and Bỏ lọc once any is set. All seven categories are always listed.
 * Props only; the page keeps the filter and filters the list.
 */
function ExpenseFilters({ months, members, filter, onChange }: ExpenseFiltersProps) {
  const t = useT()
  // A chosen month stays in the list even after its last expense goes (FR-014)
  const monthOptions =
    filter.month !== null && !months.includes(filter.month) ? [filter.month, ...months] : months
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
          {monthOptions.map((month) => (
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
          <option value="">{t.filters.all}</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-field">
        <label htmlFor="filter-category">{t.filters.category}</label>
        <select
          id="filter-category"
          value={filter.category ?? ''}
          onChange={(e) => onChange({ ...filter, category: (e.target.value || null) as Category | null })}
        >
          <option value="">{t.filters.all}</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {t.categories[category]}
            </option>
          ))}
        </select>
      </div>
      {/* A month with nothing in it says so below, with its own Bỏ lọc: not two of them */}
      {isFiltered(filter) && (filter.month === null || months.includes(filter.month)) && (
        <button type="button" className="ghost" onClick={() => onChange(NO_FILTER)}>
          {t.filters.clear}
        </button>
      )}
    </div>
  )
}

export default ExpenseFilters
