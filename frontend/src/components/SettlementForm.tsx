import { useState } from 'react'
import type { FormEvent } from 'react'

import type { Member, SettlementInput } from '../api/types'
import { isDayInRange, MAX_DAY, MIN_DAY, today } from '../lib/date'
import { formatVND } from '../lib/money'
import { parseAmount } from '../lib/split'

interface SettlementFormProps {
  members: Member[]
  /** Resolves when saved (the amount and note are cleared), rejects on failure (all kept). */
  onSubmit: (input: SettlementInput) => Promise<unknown>
  submitting: boolean
  error: string | null
}

const MAX_NOTE = 200

// US-08: "A paid B x đồng", for payments that do not match a suggested transfer exactly
function SettlementForm({ members, onSubmit, submitting, error }: SettlementFormProps) {
  const [fromId, setFromId] = useState<number | ''>(members[0]?.id ?? '')
  const [toId, setToId] = useState<number | ''>(members[1]?.id ?? '')
  const [amountText, setAmountText] = useState('')
  const [settledAt, setSettledAt] = useState(today())
  const [note, setNote] = useState('')
  const [validation, setValidation] = useState<string | null>(null)

  const amount = parseAmount(amountText)

  function problem(): string | null {
    if (fromId === '' || toId === '') return 'Hãy chọn người trả và người nhận.'
    if (fromId === toId) return 'Người trả và người nhận phải là hai người khác nhau.'
    if (amount === null || amount <= 0) return 'Số tiền chưa hợp lệ. Ví dụ: 120000, 120.000 hoặc 120k.'
    if (!settledAt) return 'Hãy chọn ngày.'
    if (!isDayInRange(settledAt)) return 'Ngày phải trong khoảng 01/01/2000 đến 31/12/2099.'
    return null
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const found = problem()
    setValidation(found)
    if (found) return
    const input: SettlementInput = {
      from_member_id: fromId as number,
      to_member_id: toId as number,
      amount: amount as number,
      settled_at: settledAt,
    }
    if (note.trim()) input.note = note.trim()
    try {
      await onSubmit(input)
      setAmountText('')
      setNote('')
    } catch {
      // The page shows the server's message through `error`; keep what the user typed
    }
  }

  const options = members.map((m) => (
    <option key={m.id} value={m.id}>
      {m.name}
    </option>
  ))
  const pick = (value: string) => (value === '' ? '' : Number(value))

  return (
    <form className="settlement-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="settlement-from">Người trả</label>
      <select id="settlement-from" value={fromId} onChange={(e) => setFromId(pick(e.target.value))}>
        {options}
      </select>

      <label htmlFor="settlement-to">Người nhận</label>
      <select id="settlement-to" value={toId} onChange={(e) => setToId(pick(e.target.value))}>
        {options}
      </select>

      <label htmlFor="settlement-amount">Số tiền (đồng)</label>
      <input
        id="settlement-amount"
        type="text"
        inputMode="numeric"
        value={amountText}
        placeholder="120.000 hoặc 120k"
        aria-describedby="settlement-amount-preview"
        onChange={(e) => setAmountText(e.target.value)}
      />
      <span id="settlement-amount-preview" className="hint">
        {amount !== null && amount > 0 ? formatVND(amount) : ''}
      </span>

      <label htmlFor="settlement-date">Ngày</label>
      <input
        id="settlement-date"
        type="date"
        min={MIN_DAY}
        max={MAX_DAY}
        value={settledAt}
        onChange={(e) => setSettledAt(e.target.value)}
      />

      <label htmlFor="settlement-note">Ghi chú (không bắt buộc)</label>
      <input
        id="settlement-note"
        type="text"
        value={note}
        maxLength={MAX_NOTE}
        placeholder="Chuyển khoản"
        onChange={(e) => setNote(e.target.value)}
      />

      {validation && <p role="alert">{validation}</p>}
      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Đang lưu…' : 'Ghi nhận khoản trả'}
      </button>
    </form>
  )
}

export default SettlementForm
