import type { Member, Settlement } from '../api/types'
import { formatDate } from '../lib/date'
import { formatVND } from '../lib/money'

interface SettlementListProps {
  settlements: Settlement[]
  members: Member[]
  onDelete: (settlement: Settlement) => void
  /** The settlement being deleted right now: its button is disabled so a double click sends one request. */
  deletingId?: number | null
  loading?: boolean
  error?: string | null
}

/** Props-only list. Deleting is a callback; the page does the API call. */
function SettlementList({
  settlements,
  members,
  onDelete,
  deletingId = null,
  loading = false,
  error = null,
}: SettlementListProps) {
  if (loading) {
    return <p>Đang tải các khoản trả…</p>
  }

  function memberName(id: number): string {
    return members.find((member) => member.id === id)?.name ?? 'Thành viên đã xoá'
  }

  // Deleting cannot be undone from the UI, so ask first
  function confirmDelete(settlement: Settlement) {
    if (window.confirm(`Xoá khoản trả của ${memberName(settlement.from_member_id)}?`)) {
      onDelete(settlement)
    }
  }

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {/* An empty list after an error means "could not load", not "nothing was paid back" */}
      {settlements.length === 0 ? (
        !error && <p>Chưa ghi nhận khoản trả nào.</p>
      ) : (
        <ul className="settlement-list">
          {settlements.map((settlement) => {
            const deleting = deletingId === settlement.id
            return (
              <li key={settlement.id} className="settlement-row">
                <span className="settlement-text">
                  <strong>{memberName(settlement.from_member_id)}</strong> đã trả{' '}
                  <strong>{memberName(settlement.to_member_id)}</strong>{' '}
                  {formatVND(settlement.amount)} · {formatDate(settlement.settled_at)}
                </span>
                {settlement.note && <span className="settlement-note">{settlement.note}</span>}
                <button
                  type="button"
                  aria-label={`Xoá khoản trả của ${memberName(settlement.from_member_id)}`}
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
