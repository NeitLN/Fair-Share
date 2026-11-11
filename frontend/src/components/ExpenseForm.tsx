import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, Ref } from 'react'

import type { Category, DraftShare, Expense, ExpenseInput, Member, RecurringItem, SplitType } from '../api/types'
import { guessCategory } from '../lib/categories'
import { monthNumber } from '../lib/expenseFilters'
import { keptPeople } from '../lib/recurring'
import { newDraftId } from '../lib/draftId'
import { dayLabel, isDayInRange, MAX_DAY, MIN_DAY, today } from '../lib/date'
import { formatVND } from '../lib/money'
import { memberLooks, REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import type { FormError } from '../lib/formError'
import { equalSplit, LARGE_AMOUNT, MAX_AMOUNT, parseAmount } from '../lib/split'
import { useVisibleSaveError } from '../lib/toast'
import { useSaveLock } from '../lib/useSaveLock'
import { Avatar } from './Avatar'
import { CategoryPicker } from './CategoryPicker'
import { useT } from '../i18n'

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
  /**
   * Named amounts placed by the server (specs/009-ai-custom-split). Applied only while they still hold
   * in the form: the total, and the payer when the rest went to them, are the draft's, and the user has
   * not set the split. Otherwise the split is left alone and Lưu waits for the user to set it.
   */
  custom?: {
    shares: DraftShare[]
    restTo: number | null
    restAmount: number
    restToPayer: boolean
  } | null
  /** Named amounts that could not be placed: shown as read, and Lưu waits until the split is edited. */
  blocked?: { preview: DraftShare[]; message: string } | null
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
  /** Saves what is typed as a new draft: after "this draft was already saved" (specs/020, FR-009). */
  saveAsNew: () => void
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
  /**
   * A due recurring item to record (specs/007-recurring-expenses): the form opens filled from it and
   * saves the month's expense of it. Mount the form with a key per item so it starts fresh.
   */
  fromItem?: RecurringItem | null
  /** Resolves when saved, rejects on failure (the form keeps everything the user typed). */
  onSubmit: (input: ExpenseInput) => Promise<unknown>
  onCancel?: () => void
  submitting: boolean
  /**
   * Why the last save failed (lib/formError.ts): shown in the save area, and the field it is about gets
   * the focus (specs/011-first-impressions, FR-002 to FR-004). Null when nothing failed.
   */
  serverError?: FormError | null
}

/** Whether the one-time equal prefill of Tự chia (FR-014) may still run, has run, or must never run. */
type Prefill = 'pending' | 'done' | 'off'
// Server messages about these fields go away as soon as one of them changes (FR-004)
const SPLIT_INPUTS: FillField[] = ['amount', 'payer', 'date', 'split']

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
  fromItem = null,
  onSubmit,
  onCancel,
  submitting,
  serverError = null,
}: ExpenseFormProps) {
  const t = useT()
  const editing = Boolean(initial)
  const initialShares = new Map(initial?.shares.map((s) => [s.member_id, s.amount]))
  const looks = useMemo(() => givenLooks ?? memberLooks(members), [givenLooks, members])
  const shortName = (id: number) => (looks.get(id) ?? REMOVED_MEMBER).short
  const validPayer = (id: number | null) => (id !== null && members.some((m) => m.id === id) ? id : '')
  /** "Còn lại 200.000đ tính cho Tiến (người trả)": who took what the named amounts left. */
  function restNote(restTo: number | null, restAmount: number, toPayer: boolean): string {
    const money = formatVND(restAmount)
    if (restTo === null) return t.form.restEqual(money)
    return toPayer ? t.form.restToPayer(money, shortName(restTo)) : t.form.restTo(money, shortName(restTo))
  }

  // Filled from a recurring item: only the people still in the house, and who was left out (FR-008)
  const [kept] = useState(() => (fromItem ? keptPeople(fromItem, members) : null))
  const [description, setDescription] = useState(initial?.description ?? fromItem?.description ?? '')
  const [amountText, setAmountText] = useState(
    initial ? String(initial.amount) : fromItem?.amount ? String(fromItem.amount) : '',
  )
  const [payerId, setPayerId] = useState<number | ''>(
    initial?.payer_id ?? (kept ? (kept.payerId ?? '') : validPayer(defaultPayer)),
  )
  // The payer is still the default (not chosen by the user, not filled or cleared by the AI): only then
  // may a change of "Bạn là ai?" move it. Its value alone cannot tell, the AI may fill the same person.
  const [payerIsDefault, setPayerIsDefault] = useState(!initial && !fromItem)
  const [spentAt, setSpentAt] = useState(initial?.spent_at ?? today())
  const [splitType, setSplitType] = useState<SplitType>(initial?.split_type ?? 'equal')
  // Danh mục (specs/005-expense-categories): guessed from the description until the user picks one.
  // Editing keeps the stored one; an AI fill sets the description, so the guess follows it too.
  const [pickedCategory, setPickedCategory] = useState<Category | null>(
    initial ? (initial.category ?? 'other') : (fromItem?.category ?? null),
  )
  const category = pickedCategory ?? guessCategory(description)
  // Equal split: who takes part. A new expense starts with everyone.
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(initial ? initialShares.keys() : kept ? kept.memberIds : members.map((m) => m.id)),
  )
  // "Lặp lại hằng tháng" (specs/007-recurring-expenses): only when adding, never when recording an item
  const [repeat, setRepeat] = useState(false)
  const [varying, setVarying] = useState(false)
  const offerRepeat = !editing && !fromItem
  // Custom split: what each person typed, kept as text so "240.000" stays as typed.
  const [customText, setCustomText] = useState<Record<number, string>>(() =>
    initial?.split_type === 'custom'
      ? Object.fromEntries([...initialShares].map(([id, amount]) => [id, String(amount)]))
      : {},
  )
  const [problems, setProblems] = useState<Problems>({})
  // After a failed save, every edit checks the form again, so the summary moves to the next problem
  // instead of vanishing while something is still wrong (specs/011, FR-004)
  const [submittedOnce, setSubmittedOnce] = useState(false)
  // A server message the person has since acted on (changed its field, or saved again)
  const [settledError, setSettledError] = useState<FormError | null>(null)
  // A large total waiting for "Lưu thật", and the one already confirmed (FR-011, FR-012)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [confirmedAmount, setConfirmedAmount] = useState<number | null>(null)
  // "Lưu thật" acts on a click, or on a key pressed while it had the focus: never on an Enter held
  // since before it appeared
  const keyOnConfirm = useRef(false)
  const saving = useRef(false)
  // The draft's identity, made at its first press (draftId() below); '' until then
  const draft = useRef('')
  // While the save is on its way nothing in the form changes (specs/018, FR-007)
  const lock = useSaveLock(submitting)
  const [prefill, setPrefill] = useState<Prefill>(initial?.split_type === 'custom' ? 'off' : 'pending')
  // The date and the split are folded: the 90% case is "today, everyone, equally"
  const [dateOpen, setDateOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const dateToggle = useRef<HTMLButtonElement>(null)
  const splitToggle = useRef<HTMLButtonElement>(null)

  // DESIGN.md §8: Escape inside an open fold closes it and gives the focus back to its button
  function closeOnEscape(event: KeyboardEvent, open: boolean, close: () => void, toggle: HTMLButtonElement | null) {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    event.stopPropagation()
    close()
    toggle?.focus()
  }

  // AI quick add: what the user changed by hand is never overwritten, and a fill can be undone
  const [touched, setTouched] = useState<Set<FillField>>(new Set())
  const [justFilled, setJustFilled] = useState<Set<FillField>>(new Set())
  const [fromAi, setFromAi] = useState(false)
  // e.g. "AI chia cho cả nhà, bạn kiểm tra lại.": only while the split the AI filled is untouched
  const [splitNote, setSplitNote] = useState<string | null>(null)
  // Why Lưu waits for the user to set the split (specs/009-ai-custom-split): named amounts that could
  // not be placed, or no longer hold. Only an edit of the split (or Hoàn tác) lifts it; changing the
  // total or the payer does not, since a split that merely adds up may still not be what was said.
  const [splitBlock, setSplitBlock] = useState<string | null>(null)
  // A split by named amounts the AI filled, while it stands: who the rest went to was the payer then
  // (#220 review). Picking another payer afterwards would leave that rest on the wrong person.
  const [restFrom, setRestFrom] = useState<{ payer: number | null; toPayer: boolean } | null>(null)
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
      splitBlock: string | null
      repeat: boolean
      varying: boolean
      prefill: Prefill
    }
  } | null>(null)
  const descriptionInput = useRef<HTMLInputElement>(null)
  const formElement = useRef<HTMLFormElement>(null)
  // The field to focus once it is on screen (a folded field opens first)
  // A form field, or a finer target inside the split: "split-share-<id>", "split-person" (FR-002)
  const focusField = useRef<string | null>(null)

  // "Bạn là ai?" chosen while the form is open: an untouched default follows it
  const [seenDefault, setSeenDefault] = useState(defaultPayer)
  // Not while a save is on its way: the payer being saved stays on screen (specs/018, FR-007)
  if (defaultPayer !== seenDefault && !submitting) {
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
    focusTarget(field)
  })

  /** Scrolls a field into view (instantly when the person asked for less motion) and focuses it. */
  function focusTarget(field: string) {
    const element = formElement.current?.querySelector<HTMLElement>(`[data-field="${field}"]`)
    if (!element) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    element.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
    element.focus({ preventScroll: true })
  }

  // A new failure from the server: its field (opened if folded) gets the focus; a general failure
  // only shows in the summary (FR-002, FR-003)
  const [seenError, setSeenError] = useState<FormError | null>(null)
  if (serverError !== seenError) {
    setSeenError(serverError)
    if (serverError?.field) {
      if (serverError.field === 'date') setDateOpen(true)
      if (serverError.field === 'split') setSplitOpen(true)
      focusField.current = serverError.field
    }
  }
  const shownError = serverError && serverError !== settledError ? serverError : null

  function edited(field: FillField) {
    // A field edited after a fill is the user's now: undo must not take it back
    lastFill.current?.fields.delete(field)
    if (field === 'split') {
      setSplitNote(null)
      setSplitBlock(null)
      setRestFrom(null)
    }
    // "Còn lại 200.000đ tính cho Tiến" was about the total the AI read; a new total makes it untrue
    // (the shares then stop adding up, so Lưu is refused by the usual check)
    if (field === 'amount' && restFrom) setSplitNote(null)
    // A refusal about the split goes when anything the split depends on changes; any other one (a lost
    // connection has no field) only when its own field does
    if (serverError && (field === serverError.field || (serverError.field === 'split' && SPLIT_INPUTS.includes(field)))) {
      setSettledError(serverError)
    }
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

  /**
   * Every way the split type changes goes through here: a new expense that becomes Tự chia cannot
   * repeat monthly, so the repeat options are switched off with it (specs/011, FR-010).
   */
  function chooseSplit(next: SplitType) {
    setSplitType(next)
    if (next === 'custom' && offerRepeat) {
      setRepeat(false)
      setVarying(false)
    }
  }

  useImperativeHandle(ref, () => ({
    fill(values: FormFill): FillResult {
      // What is being saved cannot change underneath (specs/018, FR-007, FR-008)
      if (submitting) return { filled: [], kept: [], cleared: [] }
      const memberIds = new Set(members.map((m) => m.id))
      const offered: [FillField, boolean][] = [
        ['description', Boolean(values.description?.trim())],
        ['amount', values.amount != null && values.amount > 0],
        ['payer', values.payer_id != null && memberIds.has(values.payer_id)],
        ['date', Boolean(values.spent_at)],
        [
          'split',
          Boolean(values.member_ids?.some((id) => memberIds.has(id)) || values.custom || values.blocked),
        ],
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

      // Named amounts (specs/009-ai-custom-split): what goes in the split, and whether Lưu must wait
      let shares: DraftShare[] | null = null
      let block: string | null = null
      let note = values.splitNote?.trim() || null
      let rest: { payer: number | null; toPayer: boolean } | null = null
      if (values.blocked) {
        shares = values.blocked.preview.filter((s) => memberIds.has(s.member_id))
        block = values.blocked.message
        note = null
      } else if (values.custom) {
        const custom = values.custom
        // The total and payer the form will hold once this fill is applied
        const amountAfter = fill.has('amount') ? values.amount : clear.has('amount') ? null : parseAmount(amountText)
        const payerAfter = fill.has('payer') ? values.payer_id : clear.has('payer') || payerId === '' ? null : payerId
        const holds =
          fill.has('split') &&
          amountAfter === values.amount &&
          (!custom.restToPayer || payerAfter === values.payer_id) &&
          custom.shares.every((s) => memberIds.has(s.member_id))
        if (holds) {
          shares = custom.shares
          note = custom.restAmount > 0 ? restNote(custom.restTo, custom.restAmount, custom.restToPayer) : null
          rest = custom.restAmount > 0 ? { payer: values.payer_id ?? null, toPayer: custom.restToPayer } : null
        } else {
          block = t.ai.formDiffers
          // The user's split (or the one there) stays as it is
          fill.delete('split')
          result.filled = result.filled.filter((field) => field !== 'split')
        }
      }
      if (fill.size === 0 && clear.size === 0 && block === null) return result

      lastFill.current = {
        fields: new Set([...fill, ...clear]),
        before: {
          description,
          amountText,
          payerId,
          payerIsDefault,
          spentAt,
          splitType,
          selected,
          customText,
          splitBlock,
          repeat,
          varying,
          prefill,
        },
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
        if (shares) {
          chooseSplit('custom')
          // Shares from quick add are used as they are: the equal prefill never runs over them
          setPrefill('off')
          setSelected(new Set(shares.map((s) => s.member_id)))
          setCustomText(Object.fromEntries(shares.map((s) => [s.member_id, String(s.amount)])))
          // Folded, the split would be saved unseen: open it so the amounts are read before Lưu
          setSplitOpen(true)
        } else {
          chooseSplit('equal')
          setSelected(new Set((values.member_ids ?? []).filter((id) => memberIds.has(id))))
          setCustomText({})
        }
        setSplitNote(note)
        setRestFrom(rest)
      }
      if (block !== null) {
        setSplitBlock(block)
        setSplitOpen(true)
      } else if (fill.has('split')) {
        setSplitBlock(null)
      }
      setJustFilled(fill)
      if (fill.size > 0) setFromAi(true)
      // Only the fields the AI filled lose their message; one still empty keeps saying what it needs
      fill.forEach((field) => clearProblem(field))
      return result
    },
    undoFill() {
      // Only the latest fill, and only the fields nobody has edited since
      const last = lastFill.current
      if (!last || submitting) return
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
        chooseSplit(before.splitType)
        setSelected(before.selected)
        setCustomText(before.customText)
        setPrefill(before.prefill)
        if (offerRepeat) {
          setRepeat(before.repeat)
          setVarying(before.varying)
        }
        setSplitNote(null)
        setRestFrom(null)
      }
      // A block set by this fill goes with it, even when the split itself was the user's
      setSplitBlock(before.splitBlock)
      setJustFilled(new Set())
      setFromAi(false)
      lastFill.current = null
    },
    focusDescription() {
      descriptionInput.current?.focus()
    },
    saveAsNew() {
      // "Ghi thành khoản mới" (specs/020, FR-009): what is typed becomes another draft, then is saved
      draft.current = ''
      // The button pressed goes with its line once the save starts: the focus waits on Lưu, which
      // stays focusable while saving (specs/018, FR-011; review of #297)
      focusTarget('save')
      void save(false)
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
    if (text.length === 0) found.description = t.form.descriptionEmpty
    else if (text.length > MAX_DESCRIPTION) found.description = t.form.descriptionProblem(MAX_DESCRIPTION)
    // An empty field says what to do; the format examples are for something typed that is not money
    if (amountText.trim() === '') found.amount = t.form.amountEmpty
    else if (amount === null || amount <= 0) found.amount = t.form.amountProblem
    else if (amount > MAX_AMOUNT) found.amount = t.form.amountTooLarge
    if (payerId === '') found.payer = t.form.payerProblem
    if (!spentAt) found.date = t.form.dateMissing
    // The API refuses other years (T-25); a typo like 0202 is caught here, under the field
    else if (!isDayInRange(spentAt)) found.date = t.form.dateRange
    if (splitBlock) {
      found.split = splitBlock
    } else if (repeat && offerRepeat && splitType === 'custom') {
      found.split = t.recurring.equalOnly
    } else if (splitType === 'equal') {
      if (selected.size === 0) found.split = t.form.pickSomeone
    } else if (customInvalid) {
      found.split = t.form.badShare
    } else if (customPeople === 0) {
      found.split = t.form.noShare
    } else if (remainder !== 0) {
      found.split = t.form.sharesMismatch
    }
    return found
  }

  /** Where the focus goes for a split problem (FR-002): the share or person to fix, else the mode. */
  function splitTarget(): string {
    if (splitBlock || (repeat && offerRepeat && splitType === 'custom')) return 'split'
    if (splitType === 'equal') return selected.size === 0 ? 'split-person' : 'split'
    const unreadable = customShares.find((s) => s.amount === null)
    if (unreadable) return `split-share-${unreadable.member_id}`
    return members.length > 0 ? `split-share-${members[0].id}` : 'split'
  }

  // After a failed save the shown problems follow every edit; before, they are what the last save found
  const current: Problems = submittedOnce ? check() : problems
  const firstProblem = ORDER.find((field) => current[field])
  const reason = firstProblem ? current[firstProblem] : (shownError?.message ?? null)
  // A line about the network is a whole sentence: never "Chưa lưu được: Chưa nhận được kết quả…" (specs/018)
  const summary = reason ? (!firstProblem && shownError?.alone ? reason : t.form.notSaved(reason)) : null
  // While it is on screen no "Đã lưu" toast stands next to it (specs/018, FR-012)
  useVisibleSaveError(summary, () => formElement.current?.querySelector<HTMLElement>('button[type="submit"]') ?? null)
  // The confirmation stands only for the amount it was asked about (FR-012)
  const confirmShown = confirming !== null && confirming === amount

  /**
   * Prefills Tự chia once with the equal split (FR-014): when the person switches to it with a valid
   * total, or, if the total was not there yet, when they leave the amount field with one. Not on each
   * keystroke: "3" on the way to "300000" would split 3 đồng. A share already typed is never replaced.
   */
  function prefillShares(mode: SplitType) {
    if (prefill !== 'pending' || mode !== 'custom') return
    if (amount === null || amount <= 0 || amount > MAX_AMOUNT || selected.size === 0) return
    setPrefill('done')
    if (Object.values(customText).some((text) => text.trim() !== '')) return
    const equal = equalSplit(amount, [...selected])
    setCustomText(Object.fromEntries([...equal].map(([id, share]) => [id, String(share)])))
  }

  /**
   * This draft's identity (specs/020-no-double-save, FR-001): made at the first press and kept for every
   * press until a save succeeds or "Ghi thành khoản mới". A refusal, a "result unknown", a quick-add fill
   * or a changed field keeps it. Opening the form (a new key: another house, an edit, "Ghi kỳ này", Huỷ)
   * starts with a fresh one.
   */
  function draftId(): string {
    if (!draft.current) draft.current = newDraftId()
    return draft.current
  }

  function toInput(): ExpenseInput {
    const base = {
      description: description.trim(),
      amount: amount as number,
      payer_id: payerId as number,
      spent_at: spentAt,
      source: initial?.source ?? (fromAi ? 'ai' : 'manual'),
      category,
      // An edit has nothing to save twice: it writes the same values again
      ...(editing ? {} : { draft_id: draftId() }),
      ...(fromItem
        ? { recurring_item_id: fromItem.id }
        : repeat && offerRepeat
          ? { recurring: { varying_amount: varying } }
          : {}),
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
    // While a large total waits for "Lưu thật", Enter in a field never saves (FR-011)
    if (confirmShown || submitting) return
    await save(false)
  }

  async function save(confirmed: boolean) {
    // A second press (double click, Enter in a field) while the first save is on its way does nothing,
    // whatever the page has re-rendered by then
    if (saving.current) return
    const found = check()
    setProblems(found)
    // A new attempt: the last server message has been acted on
    if (serverError) setSettledError(serverError)
    const first = ORDER.find((field) => found[field])
    if (first) {
      setSubmittedOnce(true)
      // Each message is under its field and in the save area; the first one gets focus, opening its fold
      if (first === 'date') setDateOpen(true)
      if (first === 'split') setSplitOpen(true)
      focusField.current = first === 'split' ? splitTarget() : first
      return
    }
    // An edit that keeps the amount already saved is not asked about again (review of #235)
    const savedBefore = initial !== undefined && initial !== null && amount === initial.amount
    if (!confirmed && amount !== null && amount > LARGE_AMOUNT && confirmedAmount !== amount && !savedBefore) {
      setConfirming(amount)
      return
    }
    saving.current = true
    try {
      await onSubmit(toInput())
      setSubmittedOnce(false)
      setConfirmedAmount(null)
      // Saved: the next press is another expense, even with the same values ("Đi chợ" twice a day)
      draft.current = ''
      if (!editing) {
        // Ready for the next expense: today, the default payer (you, or without an identity the payer
        // just saved, which the page now remembers) and an equal split between everyone again, as
        // DESIGN.md says. Keeping the last split left someone out of the next expense without a word, and
        // keeping the date filed the next purchase on the day of the one before (UI review 04/11).
        setDescription('')
        setAmountText('')
        setSpentAt(today())
        setSplitType('equal')
        setSelected(new Set(members.map((m) => m.id)))
        setCustomText({})
        setPayerId(validPayer(defaultPayer))
        setPayerIsDefault(true)
        setPickedCategory(null)
        setRepeat(false)
        setVarying(false)
        // The next expense starts from scratch: nothing touched, nothing from the AI
        setTouched(new Set())
        setJustFilled(new Set())
        setFromAi(false)
        setSplitNote(null)
        setSplitBlock(null)
        setRestFrom(null)
        setPrefill('pending')
        lastFill.current = null
      }
    } catch {
      // The page shows the server's message through `error`; keep what the user typed
    } finally {
      saving.current = false
    }
  }

  function confirmSave() {
    setConfirmedAmount(confirming)
    setConfirming(null)
    // Lưu thật goes away with the question: the focus moves to the save button that takes its place
    focusField.current = 'save'
    void save(true)
  }

  function cancelConfirm() {
    setConfirming(null)
    focusTarget('amount')
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
    const ids = [...describedBy, current[field] ? problemId(field) : ''].filter(Boolean).join(' ')
    return {
      'aria-invalid': current[field] ? true : undefined,
      'aria-describedby': ids || undefined,
    }
  }
  const problemText = (field: FillField) =>
    current[field] && (
      <p id={problemId(field)} className="field-problem">
        {current[field]}
      </p>
    )

  const [dayWord, dayDate] = dayLabel(spentAt).split(', ')
  const splitSummary =
    splitType === 'custom'
      ? t.form.summaryCustom(customPeople)
      : selected.size === members.length
        ? t.form.summaryEveryone(members.length)
        : t.form.summaryEqual(selected.size, members.length)

  return (
    <form ref={formElement} className="expense-form" onSubmit={handleSubmit} noValidate {...lock.form}>
      {fromItem && (
        <p className="note field-note recurring-period" role="status">
          {t.recurring.period(monthNumber((spentAt || today()).slice(0, 7)))}
        </p>
      )}
      <div className="field">
        <label htmlFor="expense-description">{t.form.description}</label>
        <input
          ref={descriptionInput}
          id="expense-description"
          data-field="description"
          className={flash('description').trim() || undefined}
          type="text"
          value={description}
          maxLength={MAX_DESCRIPTION}
          placeholder={t.form.descriptionPlaceholder}
          {...invalid('description')}
          {...lock.text}
          onChange={(e) => {
            edited('description')
            setDescription(e.target.value)
          }}
        />
        {problemText('description')}
      </div>

      <div className="field">
        <label htmlFor="expense-amount">{t.form.amount}</label>
        <div className="amount-row">
          <input
            id="expense-amount"
            data-field="amount"
            // A varying item (electricity): the real bill is what is left to type
            autoFocus={Boolean(fromItem) && !fromItem?.amount}
            className={flash('amount').trim() || undefined}
            type="text"
            inputMode="numeric"
            value={amountText}
            placeholder={t.form.amountPlaceholder}
            {...invalid('amount', 'expense-amount-preview')}
            {...lock.text}
            onChange={(e) => {
              edited('amount')
              setAmountText(e.target.value)
            }}
            onBlur={() => prefillShares(splitType)}
          />
          <span id="expense-amount-preview" className="amount-preview">
            {amount !== null && amount > 0 ? `= ${formatVND(amount)}` : ''}
          </span>
        </div>
        {problemText('amount')}
      </div>

      <fieldset className={`field payer${flash('payer')}`} {...invalid('payer')}>
        <legend>{t.form.whoPaid}</legend>
        {kept && kept.payerId === null && payerId === '' && <p className="note field-note">{t.recurring.pickPayer}</p>}
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
                  aria-invalid={current.payer ? true : undefined}
                  aria-describedby={current.payer ? problemId('payer') : undefined}
                  {...lock.choice}
                  onChange={() => {
                    edited('payer')
                    setPayerId(m.id)
                    setPayerIsDefault(false)
                    // The AI's split gave the rest to the payer it read: with another payer it no longer
                    // holds, the same as at fill time (formDiffers), so Lưu waits for the split to be set
                    if (restFrom?.toPayer && m.id !== restFrom.payer) {
                      setSplitNote(null)
                      setSplitBlock(t.ai.payerChanged)
                      setSplitOpen(true)
                    }
                  }}
                />
                <label htmlFor={`payer-${m.id}`} title={look.full}>
                  <Avatar look={look} size="sm" decorative />
                  <span className="name">{look.short}</span>
                  {me === m.id && <span className="you">{t.common.youInBrackets}</span>}
                </label>
              </span>
            )
          })}
        </div>
        {problemText('payer')}
      </fieldset>

      <div className={`field fold-field${flash('date')}`}
        onKeyDown={(event) => closeOnEscape(event, dateOpen, () => setDateOpen(false), dateToggle.current)}
      >
        <div className="fold-row">
          <span className="fold-label" id="expense-date-label">
            {t.form.date}
          </span>
          <span className="fold-value">
            <b>{dayWord}</b>
            {dayDate && `, ${dayDate}`}
          </span>
          <button
            type="button"
            className="btn-ghost"
            ref={dateToggle}
            aria-label={dateOpen ? t.form.dateDoneLabel : t.form.dateChangeLabel}
            aria-expanded={dateOpen}
            aria-controls="expense-date-control"
            onClick={() => setDateOpen((open) => !open)}
          >
            {dateOpen ? t.common.done : t.common.change}
          </button>
        </div>
        <div id="expense-date-control" className="fold-control" hidden={!dateOpen}>
          {dateOpen && (
            <input
              id="expense-date"
              data-field="date"
              type="date"
              min={MIN_DAY}
              max={MAX_DAY}
              value={spentAt}
              aria-labelledby="expense-date-label"
              {...invalid('date')}
              {...lock.text}
              onChange={(e) => {
                edited('date')
                setSpentAt(e.target.value)
              }}
            />
          )}
        </div>
        {problemText('date')}
      </div>

      <CategoryPicker value={category} onPick={setPickedCategory} />

      {kept && kept.left.length > 0 && (
        <p className="note field-note">{t.recurring.leftOut(kept.left.map((id) => shortName(id)).join(', '))}</p>
      )}
      <div className={`field fold-field${flash('split')}`}
        onKeyDown={(event) => closeOnEscape(event, splitOpen, () => setSplitOpen(false), splitToggle.current)}
      >
        <div className="fold-row">
          <span className="fold-label">{t.form.split}</span>
          <span className="fold-value">{splitSummary}</span>
          <button
            type="button"
            className="btn-ghost"
            ref={splitToggle}
            aria-label={splitOpen ? t.form.splitDoneLabel : t.form.splitEditLabel}
            aria-expanded={splitOpen}
            aria-controls="expense-split-control"
            aria-describedby={
              [splitNote ? 'expense-split-note' : '', splitBlock && current.split !== splitBlock ? 'expense-split-block' : '']
                .filter(Boolean)
                .join(' ') || undefined
            }
            onClick={() => setSplitOpen((open) => !open)}
          >
            {splitOpen ? t.common.done : t.common.edit}
          </button>
        </div>
        {splitNote && (
          <p className="note field-note" id="expense-split-note">
            {splitNote}
          </p>
        )}
        {/* Said before Lưu is pressed; once pressed, the same words are the field's problem below */}
        {splitBlock && current.split !== splitBlock && (
          <p className="note attention field-note" id="expense-split-block">
            {splitBlock}
          </p>
        )}
        <div id="expense-split-control" hidden={!splitOpen}>
          {splitOpen && (
            <fieldset className="fold-control split" {...invalid('split')}>
              <legend className="visually-hidden">{t.form.split}</legend>
              <div className="segmented">
                <button
                  type="button"
                  data-field={splitType === 'equal' ? 'split' : undefined}
                  aria-describedby={current.split ? problemId('split') : undefined}
                  aria-pressed={splitType === 'equal'}
                  onClick={() => {
                    edited('split')
                    chooseSplit('equal')
                  }}
                >
                  {t.form.splitEqual}
                </button>
                <button
                  type="button"
                  data-field={splitType === 'custom' ? 'split' : undefined}
                  aria-describedby={current.split ? problemId('split') : undefined}
                  aria-pressed={splitType === 'custom'}
                  onClick={() => {
                    edited('split')
                    chooseSplit('custom')
                    prefillShares('custom')
                  }}
                >
                  {t.form.splitCustom}
                </button>
              </div>

              {splitType === 'equal' ? (
                <ul className="split-rows">
                  {members.map((m, index) => (
                    <li key={m.id}>
                      <label className="inline">
                        <input
                          type="checkbox"
                          data-field={index === 0 ? 'split-person' : undefined}
                          checked={selected.has(m.id)}
                          {...lock.choice}
                          onChange={() => toggle(m.id)}
                        />
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
                    {members.map((m) => {
                      const text = (customText[m.id] ?? '').trim()
                      const share = text === '' ? null : parseAmount(text)
                      const unreadable = text !== '' && share === null
                      return (
                        <li key={m.id}>
                          <label htmlFor={`share-${m.id}`}>{t.form.shareOf(shortName(m.id))}</label>
                          <span className="share-input">
                            <input
                              id={`share-${m.id}`}
                              data-field={`split-share-${m.id}`}
                              type="text"
                              inputMode="numeric"
                              value={customText[m.id] ?? ''}
                              placeholder="0"
                              aria-invalid={unreadable ? true : undefined}
                              aria-describedby={unreadable ? `share-${m.id}-problem` : `share-${m.id}-preview`}
                              {...lock.text}
                              onChange={(e) => {
                                edited('split')
                                // A share typed by the person is theirs: the equal prefill never runs over it
                                if (prefill === 'pending') setPrefill('done')
                                setCustomText({ ...customText, [m.id]: e.target.value })
                              }}
                            />
                            <span id={`share-${m.id}-preview`} className="amount-preview share-preview">
                              {share !== null && share > 0 ? `= ${formatVND(share)}` : ''}
                            </span>
                          </span>
                          {unreadable && (
                            <p id={`share-${m.id}-problem`} className="field-problem">
                              {t.form.amountProblem}
                            </p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  <p className="remainder" aria-live="polite">
                    {customInvalid
                      ? t.form.badShare
                      : remainder === 0 && customTotal > 0
                        ? t.form.sharesMatch
                        : remainder > 0
                          ? t.form.left(formatVND(remainder))
                          : t.form.over(formatVND(-remainder))}
                  </p>
                </>
              )}
            </fieldset>
          )}
        </div>
        {problemText('split')}
      </div>

      {offerRepeat && (
        <div className="field recurring-field">
          <label className="inline">
            <input
              type="checkbox"
              checked={repeat}
              // A repeating item is made as an equal split (FR-010): off and locked while Tự chia
              disabled={splitType === 'custom'}
              aria-describedby={
                splitType === 'custom' ? 'expense-repeat-locked' : repeat ? 'expense-repeat-hint' : undefined
              }
              {...lock.choice}
              onChange={(e) => setRepeat(e.target.checked)}
            />
            {t.recurring.tick}
          </label>
          {splitType === 'custom' && (
            <p id="expense-repeat-locked" className="hint">
              {t.recurring.equalOnlyLocked}
            </p>
          )}
          {repeat && (
            <>
              <p id="expense-repeat-hint" className="hint">
                {t.recurring.hint(Number((spentAt || today()).slice(8, 10)))}
              </p>
              <label className="inline">
                <input type="checkbox" checked={varying} {...lock.choice} onChange={(e) => setVarying(e.target.checked)} />
                {t.recurring.varying}
              </label>
            </>
          )}
        </div>
      )}

      <div className="form-actions">
        {/* What stops the save, where it can be seen even with the keyboard open (FR-001, FR-003) */}
        <p className="form-summary" role="status" aria-live="polite">
          {summary}
        </p>
        {confirmShown ? (
          <div
            className="form-confirm"
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              cancelConfirm()
            }}
          >
            <p id="expense-confirm-question">{t.form.confirmLarge(formatVND(confirming as number))}</p>
            <div className="form-confirm-buttons">
              <button
                type="button"
                className="btn-secondary"
                autoFocus
                aria-describedby="expense-confirm-question"
                onClick={cancelConfirm}
              >
                {t.form.confirmEdit}
              </button>
              <button
                type="button"
                className="btn-primary"
                aria-describedby="expense-confirm-question"
                disabled={submitting}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') keyOnConfirm.current = true
                }}
                onClick={(event) => {
                  // A keyboard activation counts only if the key went down on this button (FR-011)
                  if (event.detail === 0 && !keyOnConfirm.current) return
                  keyOnConfirm.current = false
                  confirmSave()
                }}
              >
                {t.form.confirmSave}
              </button>
            </div>
          </div>
        ) : (
          <div className="form-buttons">
            {/* aria-disabled, not disabled: a disabled button drops the keyboard focus to the page, so after a
                failed save the person had to Tab from the top again. save() ignores a press while one is on
                its way (accessibility pass of specs/011) */}
            <button type="submit" data-field="save" aria-disabled={submitting || undefined}>
              {submitting ? t.common.saving : editing ? t.form.saveChanges : t.form.save}
            </button>
            {onCancel && (
              <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>
                {t.common.cancel}
              </button>
            )}
          </div>
        )}
      </div>
    </form>
  )
}

export default ExpenseForm
