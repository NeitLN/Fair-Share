import type { Expense, RecurringItem } from '../api/types'
import { closeFoldOnEscape } from '../lib/fold'
import { formatVND } from '../lib/money'
import { REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { monthState } from '../lib/recurring'
import { useT } from '../i18n'

interface RecurringListProps {
  /** The house's active items, oldest first. */
  items: RecurringItem[]
  expenses: Expense[]
  /** "YYYY-MM-DD" on this device. */
  today: string
  looks: Map<number, MemberLook>
  canStop: (item: RecurringItem) => boolean
  onStop: (item: RecurringItem) => void
  stoppingId: number | null
}

/**
 * "Khoản định kỳ (n)" in Chi tiêu (specs/007-recurring-expenses), folded: every active item with its
 * day and this month's state, and "Ngừng lặp" for its creator or the owner. Stopping keeps what was
 * recorded; an item is never deleted or edited (tick again on a new expense instead).
 */
function RecurringList({ items, expenses, today, looks, canStop, onStop, stoppingId }: RecurringListProps) {
  const t = useT()
  const state = {
    recorded: t.recurring.stateRecorded,
    due: t.recurring.stateDue,
    later: t.recurring.stateLater,
  }
  return (
    <details className="fold recurring-list" onKeyDown={closeFoldOnEscape}>
      <summary>{t.recurring.listTitle(items.length)}</summary>
      {items.length === 0 ? (
        <p className="hint">{t.recurring.empty}</p>
      ) : (
        <ul>
          {items.map((item) => {
            const payer = (looks.get(item.payer_id) ?? REMOVED_MEMBER).short
            return (
              <li key={item.id}>
                <span className="recurring-text">
                  <strong>{item.description}</strong>
                  <span>
                    {item.amount === null ? t.recurring.varyingAmount : formatVND(item.amount)} ·{' '}
                    {t.recurring.paidBy(payer)} · {t.recurring.day(item.day)}
                  </span>
                  <small className="recurring-state">{state[monthState(item, expenses, today)]}</small>
                </span>
                {canStop(item) && (
                  <button
                    type="button"
                    className="btn-ghost"
                    aria-label={t.recurring.stopLabel(item.description)}
                    disabled={stoppingId === item.id}
                    onClick={() => {
                      if (window.confirm(t.recurring.stopConfirm(item.description))) onStop(item)
                    }}
                  >
                    {t.recurring.stop}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </details>
  )
}

export default RecurringList
