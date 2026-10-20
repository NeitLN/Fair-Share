import { useState } from 'react'
import type { FormEvent } from 'react'

import type { Expense, ExpenseInput, Member, SplitType } from '../api/types'
import { today } from '../lib/date'
import { formatVND } from '../lib/money'
import { equalSplit, parseAmount } from '../lib/split'

interface ExpenseFormProps {
  members: Member[]
  /** An existing expense to edit; without it the form adds a new one. */
  initial?: Expense | null
  /** Resolves when saved, rejects on failure (the form keeps everything the user typed). */
  onSubmit: (input: ExpenseInput) => Promise<unknown>
  onCancel?: () => void
  submitting: boolean
  error: string | null
}

const MAX_DESCRIPTION = 120

// US-03, US-04, US-05: one expense, split equally or by custom amounts
function ExpenseForm({ members, initial, onSubmit, onCancel, submitting, error }: ExpenseFormProps) {
  const editing = Boolean(initial)
  const initialShares = new Map(initial?.shares.map((s) => [s.member_id, s.amount]))

  const [description, setDescription] = useState(initial?.description ?? '')
  const [amountText, setAmountText] = useState(initial ? String(initial.amount) : '')
  const [payerId, setPayerId] = useState<number | ''>(initial?.payer_id ?? members[0]?.id ?? '')
  const [spentAt, setSpentAt] = useState(initial?.spent_at ?? today())
  const [splitType, setSplitType] = useState<SplitType>(initial?.split_type ?? 'equal')
  // Equal split: who takes part. A new expense starts with everyone.
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(initial ? initialShares.keys() : members.map((m) => m.id)),
  )
  // Custom split: what each person typed, kept as text so "240.000" stays as typed.
  const [customText, setCustomText] = useState<Record<number, string>>(() =>
    initial?.split_type === 'custom'
      ? Object.fromEntries([...initialShares].map(([id, amount]) => [id, String(amount)]))
      : {},
  )
  const [validation, setValidation] = useState<string | null>(null)

  const amount = parseAmount(amountText)
  const equalShares = equalSplit(amount ?? 0, [...selected])
  const customShares = members
    .map((m) => ({ member_id: m.id, text: (customText[m.id] ?? '').trim() }))
    .filter((s) => s.text !== '')
    .map((s) => ({ member_id: s.member_id, amount: parseAmount(s.text) }))
  const customInvalid = customShares.some((s) => s.amount === null)
  const customTotal = customShares.reduce((sum, s) => sum + (s.amount ?? 0), 0)
  const remainder = (amount ?? 0) - customTotal

  function problem(): string | null {
    const text = description.trim()
    if (text.length < 1 || text.length > MAX_DESCRIPTION) {
      return `Nội dung phải từ 1 đến ${MAX_DESCRIPTION} ký tự.`
    }
    if (amount === null || amount <= 0) return 'Số tiền chưa hợp lệ. Ví dụ: 240000, 240.000 hoặc 240k.'
    if (payerId === '') return 'Hãy chọn người đã trả.'
    if (!spentAt) return 'Hãy chọn ngày.'
    if (splitType === 'equal') {
      if (selected.size === 0) return 'Hãy chọn ít nhất một người cùng chia.'
    } else {
      if (customInvalid) return 'Có phần chia chưa phải là số tiền hợp lệ.'
      if (!customShares.some((s) => (s.amount ?? 0) > 0)) return 'Hãy nhập phần của ít nhất một người.'
      if (remainder !== 0) return 'Tổng các phần phải bằng đúng số tiền của khoản chi.'
    }
    return null
  }

  function toInput(): ExpenseInput {
    const base = {
      description: description.trim(),
      amount: amount as number,
      payer_id: payerId as number,
      spent_at: spentAt,
      source: initial?.source ?? 'manual',
    }
    if (splitType === 'equal') {
      return { ...base, split: { type: 'equal', member_ids: [...selected].sort((a, b) => a - b) } }
    }
    // A blank or zero share means "not part of this expense"
    const shares = customShares
      .filter((s) => (s.amount ?? 0) > 0)
      .map((s) => ({ member_id: s.member_id, amount: s.amount as number }))
    return { ...base, split: { type: 'custom', shares } }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const found = problem()
    setValidation(found)
    if (found) return
    try {
      await onSubmit(toInput())
      if (!editing) {
        // Ready for the next expense: same payer, date and way of splitting
        setDescription('')
        setAmountText('')
        setCustomText({})
      }
    } catch {
      // The page shows the server's message through `error`; keep what the user typed
    }
  }

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <form className="expense-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="expense-description">Nội dung</label>
      <input
        id="expense-description"
        type="text"
        value={description}
        maxLength={MAX_DESCRIPTION}
        placeholder="Tiền điện tháng 10"
        onChange={(e) => setDescription(e.target.value)}
      />

      <label htmlFor="expense-amount">Số tiền (đồng)</label>
      <input
        id="expense-amount"
        type="text"
        inputMode="numeric"
        value={amountText}
        placeholder="240.000 hoặc 240k"
        aria-describedby="expense-amount-preview"
        onChange={(e) => setAmountText(e.target.value)}
      />
      <span id="expense-amount-preview" className="hint">
        {amount !== null && amount > 0 ? formatVND(amount) : ''}
      </span>

      <label htmlFor="expense-payer">Người trả</label>
      <select
        id="expense-payer"
        value={payerId}
        onChange={(e) => setPayerId(e.target.value === '' ? '' : Number(e.target.value))}
      >
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <label htmlFor="expense-date">Ngày</label>
      <input
        id="expense-date"
        type="date"
        value={spentAt}
        onChange={(e) => setSpentAt(e.target.value)}
      />

      <fieldset className="split">
        <legend>Cách chia</legend>
        <label className="inline">
          <input
            type="radio"
            name="split-type"
            checked={splitType === 'equal'}
            onChange={() => setSplitType('equal')}
          />
          Chia đều
        </label>
        <label className="inline">
          <input
            type="radio"
            name="split-type"
            checked={splitType === 'custom'}
            onChange={() => setSplitType('custom')}
          />
          Chia riêng
        </label>

        {splitType === 'equal' ? (
          <ul className="split-rows">
            {members.map((m) => (
              <li key={m.id}>
                <label className="inline">
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                  {m.name}
                </label>
                <span className="share">
                  {selected.has(m.id) && amount ? formatVND(equalShares.get(m.id) ?? 0) : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ul className="split-rows">
              {members.map((m) => (
                <li key={m.id}>
                  <label htmlFor={`share-${m.id}`}>Phần của {m.name}</label>
                  <input
                    id={`share-${m.id}`}
                    type="text"
                    inputMode="numeric"
                    value={customText[m.id] ?? ''}
                    placeholder="0"
                    onChange={(e) => setCustomText({ ...customText, [m.id]: e.target.value })}
                  />
                </li>
              ))}
            </ul>
            <p className="remainder" aria-live="polite">
              {customInvalid
                ? 'Có phần chia chưa phải là số tiền hợp lệ.'
                : remainder === 0 && customTotal > 0
                  ? 'Đã chia khớp số tiền.'
                  : remainder > 0
                    ? `Còn lại: ${formatVND(remainder)}`
                    : `Vượt quá: ${formatVND(-remainder)}`}
            </p>
          </>
        )}
      </fieldset>

      {validation && <p role="alert">{validation}</p>}
      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm khoản chi'}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={submitting}>
          Hủy
        </button>
      )}
    </form>
  )
}

export default ExpenseForm
