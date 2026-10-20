import type { Expense, Member } from '../api/types'
import { formatDate } from '../lib/date'
import { formatVND } from '../lib/money'

interface ExpenseListProps {
  expenses: Expense[]
  members: Member[]
  loading: boolean
  error: string | null
  onEdit: (expense: Expense) => void
  onDelete: (expense: Expense) => void
  /** The expense being deleted right now: its buttons are disabled so a double click sends one request. */
  deletingId?: number | null
}

/** Props-only list. Editing and deleting are callbacks; the page does the API calls. */
function ExpenseList({
  expenses,
  members,
  loading,
  error,
  onEdit,
  onDelete,
  deletingId = null,
}: ExpenseListProps) {
  if (loading) {
    return <p>Đang tải danh sách khoản chi…</p>
  }

  function payerName(payerId: number): string {
    return members.find((member) => member.id === payerId)?.name ?? 'Thành viên đã xoá'
  }

  // Deleting cannot be undone from the UI, so ask first
  function confirmDelete(expense: Expense) {
    if (window.confirm(`Xoá khoản "${expense.description}"?`)) onDelete(expense)
  }

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {/* An empty list after an error means "could not load", not "no expenses" */}
      {expenses.length === 0 ? (
        !error && <p>Chưa có khoản chi nào — thêm khoản đầu tiên ở trên.</p>
      ) : (
        <ul className="expense-list">
          {expenses.map((expense) => {
            const deleting = deletingId === expense.id
            return (
              <li key={expense.id} className="expense-row">
                <div className="expense-summary">
                  <span className="expense-description">{expense.description}</span>
                  {expense.source === 'ai' && <span className="badge">AI</span>}
                  <span className="expense-amount">{formatVND(expense.amount)}</span>
                </div>
                <div className="expense-meta">
                  <strong>{payerName(expense.payer_id)}</strong> trả ·{' '}
                  {formatDate(expense.spent_at)} ·{' '}
                  {expense.split_type === 'equal' ? 'Chia đều' : 'Chia riêng'}
                </div>
                <div className="expense-actions">
                  <button
                    type="button"
                    aria-label={`Sửa ${expense.description}`}
                    disabled={deleting}
                    onClick={() => onEdit(expense)}
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    aria-label={`Xoá ${expense.description}`}
                    disabled={deleting}
                    onClick={() => confirmDelete(expense)}
                  >
                    {deleting ? 'Đang xoá…' : 'Xoá'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default ExpenseList
