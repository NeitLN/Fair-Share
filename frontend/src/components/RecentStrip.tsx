import { useRef, useState } from 'react'
import { Link } from 'react-router'

import { dayLabel } from '../lib/date'
import { formatVND } from '../lib/money'
import { REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import type { RecentItem } from '../lib/recent'
import { Avatar } from './Avatar'
import { useT } from '../i18n'

interface RecentStripProps {
  /** From recentItems(): newest first. Nothing is rendered when there are none. */
  items: RecentItem[]
  looks: Map<number, MemberLook>
  /** The signed-in member, read as "bạn" when they paid a repayment. */
  me: number | null
  householdId: number
  /** How many show before "Xem thêm": 3 on a computer, 5 on a phone. */
  initialCount: number
  /** "Đánh dấu đã xem hết": every item, folded ones too. */
  onSeen: () => void
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "Hôm nay, 06/11 · 14:05" in the device's time zone. */
function savedLabel(savedAt: string, at: (day: string, time: string) => string): string {
  const when = new Date(savedAt)
  const day = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`
  return at(dayLabel(day), `${pad(when.getHours())}:${pad(when.getMinutes())}`)
}

/**
 * "Mới ghi" on Tổng quan (specs/006-recently-added): what housemates saved since this member last marked
 * it as seen in this browser. A quiet surface, not the taro block; announced politely, never taking focus.
 * Each line opens its record: an expense in Chi tiêu (revealed), a repayment in Lịch sử trả.
 */
function RecentStrip({ items, looks, me, householdId, initialCount, onSeen }: RecentStripProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  // "Xem thêm" sends the focus to the first line it revealed (review of #201)
  const focusRevealed = useRef(false)
  const takeFocus = (element: HTMLAnchorElement | null) => {
    if (element && focusRevealed.current) {
      focusRevealed.current = false
      element.focus()
    }
  }
  if (items.length === 0) return null
  const shown = open ? items : items.slice(0, initialCount)
  const hidden = items.length - shown.length
  const nameOf = (memberId: number | null) => (memberId === null ? REMOVED_MEMBER : (looks.get(memberId) ?? REMOVED_MEMBER))

  return (
    <section className="recent-strip" aria-labelledby="recent-strip-title" aria-live="polite">
      <div className="recent-head">
        <h2 id="recent-strip-title">{t.recent.title}</h2>
        <button type="button" className="btn-ghost" aria-label={t.recent.seenLabel(items.length)} onClick={onSeen}>
          {t.recent.seen}
        </button>
      </div>
      <ul id="recent-strip-list">
        {shown.map((item, index) => {
          const ref = open && index === initialCount ? takeFocus : undefined
          const recorder = nameOf(item.recorderMemberId)
          const text =
            item.kind === 'expense'
              ? `${t.recent.expense(recorder.short, item.description ?? '')} · ${formatVND(item.amount)}`
              : t.recent.repayment(
                  recorder.short,
                  formatVND(item.amount),
                  item.fromMemberId === me ? t.common.you : nameOf(item.fromMemberId ?? null).short,
                )
          const body = (
            <>
              <Avatar look={recorder} size="sm" decorative />
              <span className="recent-text">{text}</span>
              <small className="recent-when">{savedLabel(item.savedAt, t.recent.at)}</small>
            </>
          )
          return (
            <li key={`${item.kind}-${item.id}`}>
              {item.kind === 'expense' ? (
                <Link ref={ref} to={`/households/${householdId}/expenses`} state={{ revealExpense: item.id }}>
                  {body}
                </Link>
              ) : (
                <a ref={ref} href={`#settlement-${item.id}`}>
                  {body}
                </a>
              )}
            </li>
          )
        })}
      </ul>
      {/* Xem thêm opens the rest and moves the focus to the first new line; once open the same
          button reads Thu gọn and folds them again, keeping the focus on itself (owner, 07/11) */}
      {items.length > initialCount && (
        <button
          type="button"
          className="btn-ghost recent-more"
          aria-expanded={open}
          aria-controls="recent-strip-list"
          onClick={() => {
            focusRevealed.current = !open
            setOpen(!open)
          }}
        >
          {open ? t.recent.less : t.recent.more(hidden)}
        </button>
      )}
    </section>
  )
}

export default RecentStrip
