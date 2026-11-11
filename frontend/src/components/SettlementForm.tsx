import { useState } from 'react'
import type { FormEvent } from 'react'

import type { Member, Notice, SettlementInput } from '../api/types'
import { isDayInRange, MAX_DAY, MIN_DAY, today } from '../lib/date'
import { formatVND } from '../lib/money'
import { parseAmount } from '../lib/split'
import { useVisibleSaveError } from '../lib/toast'
import { useSaveLock } from '../lib/useSaveLock'
import { useT } from '../i18n'

interface SettlementFormProps {
  members: Member[]
  /** Resolves when saved (the amount and note are cleared), rejects on failure (all kept). */
  onSubmit: (input: SettlementInput) => Promise<unknown>
  submitting: boolean
  error: string | null
  /**
   * Who received it, fixed: only the person who received money records it (docs/ACCOUNTS.md, S2).
   * Without it either side can be picked.
   */
  receiver?: number | null
  /**
   * The household's "Tôi đã chuyển" notices: when the chosen payer told the receiver about money, the
   * form asks whether this is that money (taken out of the notice) or another payment (specs/014).
   */
  notices?: Notice[]
}

const MAX_NOTE = 200

// US-08: "A paid B x đồng", for payments that do not match a suggested transfer exactly
function SettlementForm({ members, onSubmit, submitting, error, receiver = null, notices = [] }: SettlementFormProps) {
  const t = useT()
  // While the repayment is being recorded nothing in the form changes (specs/018, FR-007)
  const lock = useSaveLock(submitting)

  const firstOther = members.find((m) => m.id !== receiver)?.id ?? ''
  const [fromId, setFromId] = useState<number | ''>(receiver === null ? (members[0]?.id ?? '') : firstOther)
  const [toId, setToId] = useState<number | ''>(receiver ?? members[1]?.id ?? '')
  const [amountText, setAmountText] = useState('')
  const [settledAt, setSettledAt] = useState(today())
  const [note, setNote] = useState('')
  const [validation, setValidation] = useState<string | null>(null)
  // Whether this is the money the payer told about; asked only when there is such a notice
  const [asTold, setAsTold] = useState(true)
  // While its problem shows, no "saved" toast stands beside it (specs/018, FR-012)
  useVisibleSaveError(validation ?? error)

  const amount = parseAmount(amountText)
  const told = notices.find((n) => n.from_member_id === fromId && n.to_member_id === toId)
  const nameOf = (id: number | '') => members.find((m) => m.id === id)?.name ?? ''

  function problem(): string | null {
    if (fromId === '' || toId === '') return t.settlements.pickBoth
    if (fromId === toId) return t.settlements.samePerson
    // Like the expense form: an empty box says what to enter, not the rules
    if (!amountText.trim()) return t.form.amountEmpty
    if (amount === null || amount <= 0) return t.settlements.badAmount
    if (!settledAt) return t.form.dateMissing
    if (!isDayInRange(settledAt)) return t.form.dateRange
    return null
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
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
    if (told && asTold) input.notice = { version: told.version }
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
    <form className="settlement-form" onSubmit={handleSubmit} noValidate {...lock.form}>
      <label htmlFor="settlement-from">{t.settlements.fromLabel}</label>
      <select
        id="settlement-from"
        value={fromId}
        {...lock.choice}
        onChange={(e) => {
          if (!lock.locked) setFromId(pick(e.target.value))
        }}
      >
        {options}
      </select>

      <label htmlFor="settlement-to">{t.settlements.toLabel}</label>
      <select
        id="settlement-to"
        value={toId}
        disabled={receiver !== null}
        aria-describedby={receiver !== null ? 'settlement-to-hint' : undefined}
        {...lock.choice}
        onChange={(e) => {
          if (!lock.locked) setToId(pick(e.target.value))
        }}
      >
        {options}
      </select>
      {receiver !== null && (
        <span id="settlement-to-hint" className="hint">
          {t.settlements.onlyReceived}
        </span>
      )}

      <label htmlFor="settlement-amount">{t.settlements.amountLabel}</label>
      <input
        id="settlement-amount"
        type="text"
        inputMode="numeric"
        value={amountText}
        placeholder={t.settlements.amountPlaceholder}
        aria-describedby="settlement-amount-preview"
        {...lock.text}
        onChange={(e) => setAmountText(e.target.value)}
      />
      <span id="settlement-amount-preview" className="hint">
        {amount !== null && amount > 0 ? formatVND(amount) : ''}
      </span>

      {told && (
        <fieldset className="settlement-which">
          <legend>{t.settlements.whichMoney}</legend>
          <label className="inline">
            <input type="radio" name="settlement-which" checked={asTold} {...lock.choice} onChange={() => setAsTold(true)} />
            {t.settlements.toldMoney(nameOf(fromId), formatVND(told.amount))}
          </label>
          <label className="inline">
            <input type="radio" name="settlement-which" checked={!asTold} {...lock.choice} onChange={() => setAsTold(false)} />
            {t.settlements.otherMoney}
          </label>
        </fieldset>
      )}

      <label htmlFor="settlement-date">{t.settlements.dateLabel}</label>
      <input
        id="settlement-date"
        type="date"
        min={MIN_DAY}
        max={MAX_DAY}
        value={settledAt}
        {...lock.text}
        onChange={(e) => setSettledAt(e.target.value)}
      />

      <label htmlFor="settlement-note">{t.settlements.noteLabel}</label>
      <input
        id="settlement-note"
        type="text"
        value={note}
        maxLength={MAX_NOTE}
        placeholder={t.settlements.notePlaceholder}
        {...lock.text}
        onChange={(e) => setNote(e.target.value)}
      />

      {validation && <p role="alert">{validation}</p>}
      {error && <p role="alert">{error}</p>}

      <button type="submit" aria-disabled={submitting || undefined}>
        {submitting ? t.common.saving : t.settlements.submit}
      </button>
    </form>
  )
}

export default SettlementForm
