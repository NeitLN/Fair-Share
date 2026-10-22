import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { FormEvent, Ref } from 'react'

import type { Expense, ExpenseInput, Member, SplitType } from '../api/types'
import { dayLabel, today } from '../lib/date'
import { formatVND } from '../lib/money'
import { memberLooks, REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { equalSplit, parseAmount } from '../lib/split'
import { Avatar } from './Avatar'

/** The fields a quick-add draft can fill. */
export type FillField = 'description' | 'amount' | 'payer' | 'date' | 'split'

/** Values to put in the form; null or missing means "the draft has nothing for this field". */
export interface FormFill {
  description?: string | null
  amount?: number | null
  payer_id?: number | null
  spent_at?: string | null
  member_ids?: number[] | null
  /** A remark about the split, shown beside Cách chia while the filled split stands (§6.3). */
  splitNote?: string | null
}

/**
 * What fill() did: fields it filled; fields it left alone because the user had changed them; and
 * fields it emptied because the draft had nothing for them (no amount, no payer), so a default or an
 * earlier fill is never passed off as the AI's answer.
 */
export interface FillResult {
  filled: FillField[]
  kept: FillField[]
  cleared: FillField[]
}

/** What the page can ask of the form (AI quick add, US-09). */
export interface ExpenseFormHandle {
  fill: (values: FormFill) => FillResult
  undoFill: () => void
  focusDescription: () => void
}

interface ExpenseFormProps {
  ref?: Ref<ExpenseFormHandle>
  members: Member[]
  /** How each member is shown (lib/names.ts); worked out from `members` when not given. */
  looks?: Map<number, MemberLook>
  /** The member using this device, marked "(bạn)" in Ai trả?. */
  me?: number | null
  /**
   * The payer a new expense starts with: you, else the last payer used on this device (DESIGN.md
   * §6.3). Null leaves "Ai trả?" for the user. A default is not a user change: the AI may replace it.
   */
  defaultPayer?: number | null
  /** An existing expense to edit; without it the form adds a new one. */
  initial?: Expense | null
  /** Resolves when saved, rejects on failure (the form keeps everything the user typed). */
  onSubmit: (input: ExpenseInput) => Promise<unknown>
  onCancel?: () => void
  submitting: boolean
  error: string | null
}

const MAX_DESCRIPTION = 120

type Problems = Partial<Record<FillField, string>>
const ORDER: FillField[] = ['description', 'amount', 'payer', 'date', 'split']

// US-03, US-04, US-05: one expense, split equally or by custom amounts (DESIGN.md §6.3)
function ExpenseForm({
  ref,
  members,
  looks: givenLooks,
  me = null,
  defaultPayer = null,
  initial,
  onSubmit,
  onCancel,
  submitting,
  error,
}: ExpenseFormProps) {
  const editing = Boolean(initial)
  const initialShares = new Map(initial?.shares.map((s) => [s.member_id, s.amount]))
  const looks = useMemo(() => givenLooks ?? memberLooks(members), [givenLooks, members])
  const shortName = (id: number) => (looks.get(id) ?? REMOVED_MEMBER).short
  const validPayer = (id: number | null) => (id !== null && members.some((m) => m.id === id) ? id : '')

  const [description, setDescription] = useState(initial?.description ?? '')
  const [amountText, setAmountText] = useState(initial ? String(initial.amount) : '')
  const [payerId, setPayerId] = useState<number | ''>(initial?.payer_id ?? validPayer(defaultPayer))
  // The payer is still the default (not chosen by the user, not filled or cleared by the AI): only then
  // may a change of "Bạn là ai?" move it. Its value alone cannot tell, the AI may fill the same person.
  const [payerIsDefault, setPayerIsDefault] = useState(!initial)
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
  const [problems, setProblems] = useState<Problems>({})
  // The date and the split are folded: the 90% case is "today, everyone, equally"
  const [dateOpen, setDateOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)

  // AI quick add: what the user changed by hand is never overwritten, and a fill can be undone
  const [touched, setTouched] = useState<Set<FillField>>(new Set())
  const [justFilled, setJustFilled] = useState<Set<FillField>>(new Set())
  const [fromAi, setFromAi] = useState(false)
  // e.g. "AI chia cho cả nhà, bạn kiểm tra lại.": only while the split the AI filled is untouched
  const [splitNote, setSplitNote] = useState<string | null>(null)
  // The latest fill: the fields it changed (minus those the user has edited since) and their old values
  const lastFill = useRef<{
    fields: Set<FillField>
    before: {
      description: string
      amountText: string
      payerId: number | ''
      payerIsDefault: boolean
      spentAt: string
      splitType: SplitType
      selected: Set<number>
      customText: Record<number, string>
    }
  } | null>(null)
  const descriptionInput = useRef<HTMLInputElement>(null)
  const formElement = useRef<HTMLFormElement>(null)
  // The field to focus once it is on screen (a folded field opens first)
  const focusField = useRef<FillField | null>(null)

  // "Bạn là ai?" chosen while the form is open: an untouched default follows it
  const [seenDefault, setSeenDefault] = useState(defaultPayer)
  if (defaultPayer !== seenDefault) {
    setSeenDefault(defaultPayer)
    if (!editing && payerIsDefault) {
      setPayerId(validPayer(defaultPayer))
      if (validPayer(defaultPayer) !== '') clearProblem('payer')
    }
  }

  useEffect(() => {
    const field = focusField.current
    if (!field) return
    focusField.current = null
    formElement.current?.querySelector<HTMLElement>(`[data-field="${field}"]`)?.focus()
  })

  function edited(field: FillField) {
    // A field edited after a fill is the user's now: undo must not take it back
    lastFill.current?.fields.delete(field)
    if (field === 'split') setSplitNote(null)
    setTouched((current) => new Set(current).add(field))
    setJustFilled((current) => {
      const next = new Set(current)
      next.delete(field)
      return next
    })
    clearProblem(field)
  }

  function clearProblem(field: FillField) {
    setProblems((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  useImperativeHandle(ref, () => ({
    fill(values: FormFill): FillResult {
      const memberIds = new Set(members.map((m) => m.id))
      const offered: [FillField, boolean][] = [
        ['description', Boolean(values.description?.trim())],
        ['amount', values.amount != null && values.amount > 0],
        ['payer', values.payer_id != null && memberIds.has(values.payer_id)],
        ['date', Boolean(values.spent_at)],
        ['split', Boolean(values.member_ids?.some((id) => memberIds.has(id)))],
      ]
      const result: FillResult = { filled: [], kept: [], cleared: [] }
      for (const [field, available] of offered) {
        if (available) {
          if (touched.has(field)) result.kept.push(field)
          else result.filled.push(field)
        } else if ((field === 'amount' || field === 'payer') && !touched.has(field)) {
          // No amount or payer in the draft: empty the field so the user sees it needs them
          result.cleared.push(field)
        }
      }
      const fill = new Set(result.filled)
      const clear = new Set(result.cleared)
      if (fill.size === 0 && clear.size === 0) return result

      lastFill.current = {
        fields: new Set([...fill, ...clear]),
        before: { description, amountText, payerId, payerIsDefault, spentAt, splitType, selected, customText },
      }
      if (fill.has('description')) setDescription((values.description as string).trim())
      if (fill.has('amount')) setAmountText(String(values.amount))
      if (clear.has('amount')) setAmountText('')
      if (fill.has('payer')) setPayerId(values.payer_id as number)
      if (clear.has('payer')) setPayerId('')
      if (fill.has('payer') || clear.has('payer')) setPayerIsDefault(false)
      if (fill.has('date')) setSpentAt(values.spent_at as string)
      if (fill.has('split')) {
        // The split is one group: type, who takes part and any custom amounts change together
        setSplitType('equal')
        setSelected(new Set((values.member_ids as number[]).filter((id) => memberIds.has(id))))
        setCustomText({})
        setSplitNote(values.splitNote?.trim() || null)
      }
      setJustFilled(fill)
      if (fill.size > 0) setFromAi(true)
      setProblems({})
      return result
    },
    undoFill() {
      // Only the latest fill, and only the fields nobody has edited since
      const last = lastFill.current
      if (!last) return
      const { fields, before } = last
      if (fields.has('description')) setDescription(before.description)
      if (fields.has('amount')) setAmountText(before.amountText)
      if (fields.has('payer')) {
        // Back to the default means today's default: "Bạn là ai?" may have changed since the fill
        setPayerId(before.payerIsDefault ? validPayer(defaultPayer) : before.payerId)
        setPayerIsDefault(before.payerIsDefault)
      }
      if (fields.has('date')) setSpentAt(before.spentAt)
      if (fields.has('split')) {
        setSplitType(before.splitType)
        setSelected(before.selected)
        setCustomText(before.customText)
        setSplitNote(null)
      }
      setJustFilled(new Set())
      setFromAi(false)
      lastFill.current = null
    },
    focusDescription() {
      descriptionInput.current?.focus()
    },
  }))

  const flash = (field: FillField) => (justFilled.has(field) ? ' just-filled' : '')

  const amount = parseAmount(amountText)
  const equalShares = equalSplit(amount ?? 0, [...selected])
  const customShares = members
    .map((m) => ({ member_id: m.id, text: (customText[m.id] ?? '').trim() }))
    .filter((s) => s.text !== '')
    .map((s) => ({ member_id: s.member_id, amount: parseAmount(s.text) }))
  const customInvalid = customShares.some((s) => s.amount === null)
  const customTotal = customShares.reduce((sum, s) => sum + (s.amount ?? 0), 0)
  const remainder = (amount ?? 0) - customTotal
  const customPeople = customShares.filter((s) => (s.amount ?? 0) > 0).length

  function check(): Problems {
    const found: Problems = {}
    const text = description.trim()
    if (text.length < 1 || text.length > MAX_DESCRIPTION) {
      found.description = `Nội dung phải từ 1 đến ${MAX_DESCRIPTION} ký tự.`
    }
    if (amount === null || amount <= 0) found.amount = 'Số tiền chưa hợp lệ. Ví dụ: 240000, 240.000 hoặc 240k.'
    if (payerId === '') found.payer = 'Chọn người trả.'
    if (!spentAt) found.date = 'Hãy chọn ngày.'
    if (splitType === 'equal') {
      if (selected.size === 0) found.split = 'Hãy chọn ít nhất một người cùng chia.'
    } else if (customInvalid) {
      found.split = 'Có phần chia chưa phải là số tiền hợp lệ.'
    } else if (customPeople === 0) {
      found.split = 'Hãy nhập phần của ít nhất một người.'
    } else if (remainder !== 0) {
      found.split = 'Tổng các phần phải bằng đúng số tiền của khoản chi.'
    }
    return found
  }

  function toInput(): ExpenseInput {
    const base = {
      description: description.trim(),
      amount: amount as number,
      payer_id: payerId as number,
      spent_at: spentAt,
      source: initial?.source ?? (fromAi ? 'ai' : 'manual'),
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
    const found = check()
    setProblems(found)
    const first = ORDER.find((field) => found[field])
    if (first) {
      // Each message is under its field; the first one gets focus, opening its fold if needed
      if (first === 'date') setDateOpen(true)
      if (first === 'split') setSplitOpen(true)
      focusField.current = first
      return
    }
    try {
      await onSubmit(toInput())
      if (!editing) {
        // Ready for the next expense: same date and way of splitting, and the default payer again (you,
        // or without an identity the payer just saved, which the page now remembers)
        setDescription('')
        setAmountText('')
        setCustomText({})
        setPayerId(validPayer(defaultPayer))
        setPayerIsDefault(true)
        // The next expense starts from scratch: nothing touched, nothing from the AI
        setTouched(new Set())
        setJustFilled(new Set())
        setFromAi(false)
        setSplitNote(null)
        lastFill.current = null
      }
    } catch {
      // The page shows the server's message through `error`; keep what the user typed
    }
  }

  function toggle(id: number) {
    edited('split')
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Error text under a field, and what the field needs to point at it
  const problemId = (field: FillField) => `expense-${field}-problem`
  const invalid = (field: FillField, ...describedBy: string[]) => {
    const ids = [...describedBy, problems[field] ? problemId(field) : ''].filter(Boolean).join(' ')
    return {
      'aria-invalid': problems[field] ? true : undefined,
      'aria-describedby': ids || undefined,
    }
  }
  const problemText = (field: FillField) =>
    problems[field] && (
      <p id={problemId(field)} className="field-problem">
        {problems[field]}
      </p>
    )

  const [dayWord, dayDate] = dayLabel(spentAt).split(', ')
  const splitSummary =
    splitType === 'custom'
      ? `Chia riêng (${customPeople} người)`
      : selected.size === members.length
        ? `Chia đều cả nhà (${members.length} người)`
        : `Chia đều (${selected.size}/${members.length} người)`

  return (
    <form ref={formElement} className="expense-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="expense-description">Nội dung</label>
        <input
          ref={descriptionInput}
          id="expense-description"
          data-field="description"
          className={flash('description').trim() || undefined}
          type="text"
          value={description}
          maxLength={MAX_DESCRIPTION}
          placeholder="Tiền điện tháng 10"
          {...invalid('description')}
          onChange={(e) => {
            edited('description')
            setDescription(e.target.value)
          }}
        />
        {problemText('description')}
      </div>

      <div className="field">
        <label htmlFor="expense-amount">Số tiền</label>
        <div className="amount-row">
          <input
            id="expense-amount"
            data-field="amount"
            className={flash('amount').trim() || undefined}
            type="text"
            inputMode="numeric"
            value={amountText}
            placeholder="240k"
            {...invalid('amount', 'expense-amount-preview')}
            onChange={(e) => {
              edited('amount')
              setAmountText(e.target.value)
            }}
          />
          <span id="expense-amount-preview" className="amount-preview">
            {amount !== null && amount > 0 ? `= ${formatVND(amount)}` : ''}
          </span>
        </div>
        {problemText('amount')}
      </div>

      <fieldset className={`field payer${flash('payer')}`} {...invalid('payer')}>
        <legend>Ai trả?</legend>
        <div className="pick">
          {members.map((m, index) => {
            const look = looks.get(m.id) ?? REMOVED_MEMBER
            return (
              <span key={m.id}>
                <input
                  type="radio"
                  id={`payer-${m.id}`}
                  name="expense-payer"
                  data-field={(payerId === '' ? index === 0 : payerId === m.id) ? 'payer' : undefined}
                  checked={payerId === m.id}
                  aria-invalid={problems.payer ? true : undefined}
                  aria-describedby={problems.payer ? problemId('payer') : undefined}
                  onChange={() => {
                    edited('payer')
                    setPayerId(m.id)
                    setPayerIsDefault(false)
                  }}
                />
                <label htmlFor={`payer-${m.id}`} title={look.full}>
                  <Avatar look={look} size="sm" decorative />
                  <span className="name">{look.short}</span>
                  {me === m.id && <span className="you">(bạn)</span>}
                </label>
              </span>
            )
          })}
        </div>
        {problemText('payer')}
      </fieldset>

      <div className={`field fold-field${flash('date')}`}>
        <div className="fold-row">
          <span className="fold-label" id="expense-date-label">
            Ngày
          </span>
          <span className="fold-value">
            <b>{dayWord}</b>
            {dayDate && `, ${dayDate}`}
          </span>
          <button
            type="button"
            className="btn-ghost"
            aria-label={dateOpen ? 'Xong, đóng ngày' : 'Đổi ngày'}
            aria-expanded={dateOpen}
            aria-controls="expense-date-control"
            onClick={() => setDateOpen((open) => !open)}
          >
            {dateOpen ? 'Xong' : 'Đổi'}
          </button>
        </div>
        <div id="expense-date-control" className="fold-control" hidden={!dateOpen}>
          {dateOpen && (
            <input
              id="expense-date"
              data-field="date"
              type="date"
              value={spentAt}
              aria-labelledby="expense-date-label"
              {...invalid('date')}
              onChange={(e) => {
                edited('date')
                setSpentAt(e.target.value)
              }}
            />
          )}
        </div>
        {problemText('date')}
      </div>

      <div className={`field fold-field${flash('split')}`}>
        <div className="fold-row">
          <span className="fold-label">Cách chia</span>
          <span className="fold-value">{splitSummary}</span>
          <button
            type="button"
            className="btn-ghost"
            aria-label={splitOpen ? 'Xong, đóng cách chia' : 'Sửa cách chia'}
            aria-expanded={splitOpen}
            aria-controls="expense-split-control"
            aria-describedby={splitNote ? 'expense-split-note' : undefined}
            onClick={() => setSplitOpen((open) => !open)}
          >
            {splitOpen ? 'Xong' : 'Sửa'}
          </button>
        </div>
        {splitNote && (
          <p className="note field-note" id="expense-split-note">
            {splitNote}
          </p>
        )}
        <div id="expense-split-control" hidden={!splitOpen}>
          {splitOpen && (
            <fieldset className="fold-control split" {...invalid('split')}>
              <legend className="visually-hidden">Cách chia</legend>
              <div className="segmented">
                <button
                  type="button"
                  data-field={splitType === 'equal' ? 'split' : undefined}
                  aria-describedby={problems.split ? problemId('split') : undefined}
                  aria-pressed={splitType === 'equal'}
                  onClick={() => {
                    edited('split')
                    setSplitType('equal')
                  }}
                >
                  Chia đều
                </button>
                <button
                  type="button"
                  data-field={splitType === 'custom' ? 'split' : undefined}
                  aria-describedby={problems.split ? problemId('split') : undefined}
                  aria-pressed={splitType === 'custom'}
                  onClick={() => {
                    edited('split')
                    setSplitType('custom')
                  }}
                >
                  Chia riêng
                </button>
              </div>

              {splitType === 'equal' ? (
                <ul className="split-rows">
                  {members.map((m) => (
                    <li key={m.id}>
                      <label className="inline">
                        <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                        {shortName(m.id)}
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
                        <label htmlFor={`share-${m.id}`}>Phần của {shortName(m.id)}</label>
                        <input
                          id={`share-${m.id}`}
                          type="text"
                          inputMode="numeric"
                          value={customText[m.id] ?? ''}
                          placeholder="0"
                          onChange={(e) => {
                            edited('split')
                            setCustomText({ ...customText, [m.id]: e.target.value })
                          }}
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
          )}
        </div>
        {problemText('split')}
      </div>

      {/* The server's answer stays above the button (DESIGN.md §6.3) */}
      {error && <p role="alert">{error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Lưu khoản chi'}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>
            Hủy
          </button>
        )}
      </div>
    </form>
  )
}

export default ExpenseForm
