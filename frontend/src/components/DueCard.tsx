import { useRef, useState } from 'react'
import { Link } from 'react-router'

import type { RecurringItem } from '../api/types'
import { formatVND } from '../lib/money'
import { REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { useT } from '../i18n'

interface DueCardProps {
  /** From dueItems(): due this month, by day. Nothing is rendered when there are none. */
  items: RecurringItem[]
  looks: Map<number, MemberLook>
  householdId: number
}

const SHOWN = 3

/**
 * "Tới hạn" on Tổng quan (specs/007-recurring-expenses), under the transfers: the house's recurring
 * expenses whose day has come and that nobody recorded this month. "Ghi luôn" opens the add form filled;
 * a person still presses Lưu. A quiet surface, like "Mới ghi".
 */
function DueCard({ items, looks, householdId }: DueCardProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  // "Xem tất cả" disappears once pressed: its focus goes to the first line it revealed
  const focusRevealed = useRef(false)
  const takeFocus = (element: HTMLAnchorElement | null) => {
    if (element && focusRevealed.current) {
      focusRevealed.current = false
      element.focus()
    }
  }
  if (items.length === 0) return null
  const shown = open ? items : items.slice(0, SHOWN)

  return (
    <section className="due-card" aria-labelledby="due-card-title">
      <h2 id="due-card-title">{t.recurring.dueTitle}</h2>
      <ul id="due-card-list">
        {shown.map((item, index) => {
          const payer = (looks.get(item.payer_id) ?? REMOVED_MEMBER).short
          const amount = item.amount === null ? t.recurring.enterAmount : formatVND(item.amount)
          return (
            <li key={item.id}>
              <span className="due-text">
                <strong>{item.description}</strong>
                <span>
                  {amount} · {t.recurring.paidBy(payer)} · {t.recurring.day(item.day)}
                </span>
              </span>
              <Link
                ref={open && index === SHOWN ? takeFocus : undefined}
                className="btn-secondary due-record"
                to={`/households/${householdId}/expenses`}
                state={{ recordItem: item.id }}
                aria-label={t.recurring.recordLabel(item.description)}
              >
                {t.recurring.record}
              </Link>
            </li>
          )
        })}
      </ul>
      {!open && items.length > SHOWN && (
        <button
          type="button"
          className="btn-ghost due-more"
          aria-expanded={false}
          aria-controls="due-card-list"
          onClick={() => {
            focusRevealed.current = true
            setOpen(true)
          }}
        >
          {t.recurring.seeAll(items.length)}
        </button>
      )}
    </section>
  )
}

export default DueCard
