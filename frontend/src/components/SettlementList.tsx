import type { Settlement } from '../api/types'
import { dayLabel } from '../lib/date'
import { formatVND } from '../lib/money'
import { REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { Money } from './Money'

interface SettlementListProps {
  settlements: Settlement[]
  looks: Map<number, MemberLook>
  onDelete: (settlement: Settlement) => void
  /** The settlement being deleted right now: its button is disabled so a double click sends one request. */
  deletingId?: number | null
  loading?: boolean
  error?: string | null
}

/** "Lịch sử trả": the payments already made, newest first. Props only; the page does the API calls. */
function SettlementList({
  settlements,
  looks,
  onDelete,
  deletingId = null,
  loading = false,
  error = null,
}: SettlementListProps) {
  if (loading) {
    return <p className="hint">Đang tải các khoản trả…</p>
  }

  const nameOf = (id: number) => (looks.get(id) ?? REMOVED_MEMBER).short

  // Who paid whom how much: unique enough to tell two payments by the same person apart
  function describe(settlement: Settlement): string {
    const from = nameOf(settlement.from_member_id)
    const to = nameOf(settlement.to_member_id)
    return `khoản ${from} trả ${to} ${formatVND(settlement.amount)}`
  }

  // Deleting cannot be undone from the UI, so ask first
  function confirmDelete(settlement: Settlement) {
    if (window.confirm(`Xoá ${describe(settlement)}?`)) onDelete(settlement)
  }

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {/* An empty list after an error means "could not load", not "nothing was paid back" */}
      {settlements.length === 0 ? (
        !error && <p className="empty">Chưa có khoản trả nào. Bấm "Đã trả" ở trên khi ai đó trả xong.</p>
      ) : (
        <ul className="settlement-list">
          {settlements.map((settlement) => {
            const deleting = deletingId === settlement.id
            return (
              <li key={settlement.id} className="settlement-row">
                <span className="settlement-text">
                  <strong>{nameOf(settlement.from_member_id)}</strong> đã trả{' '}
                  <strong>{nameOf(settlement.to_member_id)}</strong> <Money amount={settlement.amount} />
                  <small>
                    {dayLabel(settlement.settled_at)}
                    {settlement.note && ` · ${settlement.note}`}
                  </small>
                </span>
                <button
                  type="button"
                  className="btn-danger"
                  aria-label={`Xoá ${describe(settlement)}`}
                  disabled={deleting}
                  onClick={() => confirmDelete(settlement)}
                >
                  {deleting ? 'Đang xoá…' : 'Xoá'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default SettlementList
