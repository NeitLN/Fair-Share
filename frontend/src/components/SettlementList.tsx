import type { Notice, Settlement } from '../api/types'
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
  /** Whether Xoá is offered: the owner, or whoever recorded it (docs/ACCOUNTS.md). */
  canDelete?: (settlement: Settlement) => boolean
  /** The household's notices: deleting a repayment recorded from one says what happens to it (specs/014). */
  notices?: Notice[]
}

const always = () => true

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
  canDelete = always,
  notices = [],
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
    const what = describe(settlement)
    const from = nameOf(settlement.from_member_id)
    // Recorded from a notice: the amount goes back to one, unless the pair already has another
    const question = !settlement.notice_amount
      ? t.settlements.confirmDelete(what)
      : notices.some(
            (n) => n.from_member_id === settlement.from_member_id && n.to_member_id === settlement.to_member_id,
          )
        ? t.settlements.confirmDeleteNoGiveBack(what, from)
        : t.settlements.confirmDeleteGivesBack(what, from, formatVND(settlement.notice_amount))
    if (window.confirm(question)) onDelete(settlement)
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
              <li key={settlement.id} id={`settlement-${settlement.id}`} className="settlement-row">
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
                {canDelete(settlement) && (
                  <button
                    type="button"
                    className="btn-danger"
                    aria-label={t.settlements.deleteLabel(describe(settlement))}
                    disabled={deleting}
                    onClick={() => confirmDelete(settlement)}
                  >
                    {deleting ? t.common.deleting : t.common.delete}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default SettlementList
