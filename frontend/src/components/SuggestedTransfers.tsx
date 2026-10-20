import type { Member, Transfer } from '../api/types'
import { formatVND } from '../lib/money'

interface SuggestedTransfersProps {
  /** Payments that settle everyone, already in the order to show them. */
  suggested: Transfer[]
  members: Member[]
  onRecord: (transfer: Transfer) => void
  /** Index of the transfer being recorded right now: its button is disabled so a double click sends one request. */
  recordingIndex?: number | null
  error?: string | null
}

/** Props-only list. Recording is a callback; the page does the API call. */
function SuggestedTransfers({
  suggested,
  members,
  onRecord,
  recordingIndex = null,
  error = null,
}: SuggestedTransfersProps) {
  function memberName(id: number): string {
    return members.find((member) => member.id === id)?.name ?? 'Thành viên đã xoá'
  }

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {/* An empty list after an error means "could not load", not "everyone is settled" */}
      {suggested.length === 0 ? (
        !error && <p>Mọi người đã cân bằng, không ai nợ ai.</p>
      ) : (
        <ul className="transfer-list">
          {suggested.map((transfer, index) => {
            const recording = recordingIndex === index
            return (
              <li key={`${transfer.from_member_id}-${transfer.to_member_id}`} className="transfer-row">
                <span className="transfer-text">
                  <strong>{memberName(transfer.from_member_id)}</strong> trả{' '}
                  <strong>{memberName(transfer.to_member_id)}</strong>{' '}
                  {formatVND(transfer.amount)}
                </span>
                <button type="button" disabled={recording} onClick={() => onRecord(transfer)}>
                  {recording ? 'Đang ghi nhận…' : 'Ghi nhận khoản này'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default SuggestedTransfers
