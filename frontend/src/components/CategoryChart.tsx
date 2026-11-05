import { Link } from 'react-router'

import type { CategoryTotal } from '../lib/categories'
import { formatVND } from '../lib/money'
import { Money } from './Money'
import { useT } from '../i18n'

interface CategoryChartProps {
  /** From categoryTotals(): the month's categories, largest first. */
  totals: CategoryTotal[]
  /** "YYYY-MM", for the link to Chi tiêu. */
  month: string
  householdId: number
}

/**
 * "Chi theo danh mục" in the monthly report (specs/005-expense-categories, research R4): a list, not a
 * picture. Each line says its name, amount and share in words and opens Chi tiêu on that month and
 * category; the bar beside it (width against the largest category) only decorates, so it is hidden
 * from screen readers and never the only way to read a value.
 */
function CategoryChart({ totals, month, householdId }: CategoryChartProps) {
  const t = useT()
  if (totals.length === 0) return null
  const largest = totals[0].amount
  return (
    <section className="category-chart" aria-labelledby="category-chart-title">
      <h3 id="category-chart-title">{t.categories.chartTitle}</h3>
      <ul>
        {totals.map((line) => {
          const name = t.categories[line.category]
          const share = line.tiny ? t.categories.tiny : t.categories.share(line.percent)
          return (
            <li key={line.category}>
              <Link
                to={`/households/${householdId}/expenses`}
                state={{ month, category: line.category }}
                aria-label={t.categories.lineLabel(name, formatVND(line.amount), share)}
              >
                <span className="category-name">{name}</span>
                <span className="category-track" aria-hidden="true">
                  <span className="category-bar" style={{ width: `${(line.amount / largest) * 100}%` }} />
                </span>
                <span className="category-figure">
                  <Money amount={line.amount} /> · {share}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default CategoryChart
