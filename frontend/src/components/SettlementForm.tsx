import { useState } from 'react'
import type { FormEvent } from 'react'

import type { Member, SettlementInput } from '../api/types'
import { isDayInRange, MAX_DAY, MIN_DAY, today } from '../lib/date'
import { formatVND } from '../lib/money'
import { parseAmount } from '../lib/split'
import { useT } from '../i18n'

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
  const t = useT()
  const [fromId, setFromId] = useState<number | ''>(members[0]?.id ?? '')
  const [toId, setToId] = useState<number | ''>(members[1]?.id ?? '')
  const [amountText, setAmountText] = useState('')
  const [settledAt, setSettledAt] = useState(today())
  const [note, setNote] = useState('')
  const [validation, setValidation] = useState<string | null>(null)

  const amount = parseAmount(amountText)

  function problem(): string | null {
    if (fromId === '' || toId === '') return t.settlements.pickBoth
    if (fromId === toId) return t.settlements.samePerson
    if (amount === null || amount <= 0) return t.settlements.badAmount
    if (!settledAt) return t.form.dateMissing
    if (!isDayInRange(settledAt)) return t.form.dateRange
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
      <label htmlFor="settlement-from">{t.settlements.fromLabel}</label>
      <select id="settlement-from" value={fromId} onChange={(e) => setFromId(pick(e.target.value))}>
        {options}
      </select>

      <label htmlFor="settlement-to">{t.settlements.toLabel}</label>
      <select id="settlement-to" value={toId} onChange={(e) => setToId(pick(e.target.value))}>
        {options}
      </select>

      <label htmlFor="settlement-amount">{t.settlements.amountLabel}</label>
      <input
        id="settlement-amount"
        type="text"
        inputMode="numeric"
        value={amountText}
        placeholder={t.settlements.amountPlaceholder}
        aria-describedby="settlement-amount-preview"
        onChange={(e) => setAmountText(e.target.value)}
      />
      <span id="settlement-amount-preview" className="hint">
        {amount !== null && amount > 0 ? formatVND(amount) : ''}
      </span>

      <label htmlFor="settlement-date">{t.settlements.dateLabel}</label>
      <input
        id="settlement-date"
        type="date"
        min={MIN_DAY}
        max={MAX_DAY}
        value={settledAt}
        onChange={(e) => setSettledAt(e.target.value)}
      />

      <label htmlFor="settlement-note">{t.settlements.noteLabel}</label>
      <input
        id="settlement-note"
        type="text"
        value={note}
        maxLength={MAX_NOTE}
        placeholder={t.settlements.notePlaceholder}
        onChange={(e) => setNote(e.target.value)}
      />

      {validation && <p role="alert">{validation}</p>}
      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? t.common.saving : t.settlements.submit}
      </button>
    </form>
  )
}

export default SettlementForm
