import type { Settlement } from '../api/types'
import { dayLabel } from '../lib/date'
import { formatVND } from '../lib/money'
import { REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { Money } from './Money'
import ErrorNote from './ErrorNote'
import Skeleton from './Skeleton'
import { useT } from '../i18n'

interface SettlementListProps {
  settlements: Settlement[]
  looks: Map<number, MemberLook>
  onDelete: (settlement: Settlement) => void
  /** The settlement being deleted right now: its button is disabled so a double click sends one request. */
  deletingId?: number | null
  loading?: boolean
  error?: string | null
  /** Reloads after a failed load; shows Thử lại next to the error. */
  onRetry?: () => void
  /** The reload is running: Thử lại is disabled. */
  retrying?: boolean
}

/** "Lịch sử trả": the payments already made, newest first. Props only; the page does the API calls. */
function SettlementList({
  settlements,
  looks,
  onDelete,
  deletingId = null,
  loading = false,
  error = null,
  onRetry,
  retrying = false,
}: SettlementListProps) {
  const t = useT()
  if (loading) {
    return <Skeleton label={t.settlements.loading} />
  }

  const nameOf = (id: number) => (looks.get(id) ?? REMOVED_MEMBER).short

  // Who paid whom how much: unique enough to tell two payments by the same person apart
  function describe(settlement: Settlement): string {
    const from = nameOf(settlement.from_member_id)
    const to = nameOf(settlement.to_member_id)
    return t.settlements.describe(from, to, formatVND(settlement.amount))
  }

  // Deleting cannot be undone from the UI, so ask first
  function confirmDelete(settlement: Settlement) {
    if (window.confirm(t.settlements.confirmDelete(describe(settlement)))) onDelete(settlement)
  }

  return (
    <div>
      {error && <ErrorNote message={error} onRetry={onRetry} retrying={retrying} />}
      {/* An empty list after an error means "could not load", not "nothing was paid back" */}
      {settlements.length === 0 ? (
        !error && <p className="empty">{t.settlements.empty}</p>
      ) : (
        <ul className="settlement-list">
          {settlements.map((settlement) => {
            const deleting = deletingId === settlement.id
            return (
              <li key={settlement.id} className="settlement-row">
                <span className="settlement-text">
                  {t.settlements.row(
                    <strong>{nameOf(settlement.from_member_id)}</strong>,
                    <strong>{nameOf(settlement.to_member_id)}</strong>,
                    <Money amount={settlement.amount} />,
                  )}
                  <small>
                    {dayLabel(settlement.settled_at)}
                    {settlement.note && ` · ${settlement.note}`}
                  </small>
                </span>
                <button
                  type="button"
                  className="btn-danger"
                  aria-label={t.settlements.deleteLabel(describe(settlement))}
                  disabled={deleting}
                  onClick={() => confirmDelete(settlement)}
                >
                  {deleting ? t.common.deleting : t.common.delete}
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
