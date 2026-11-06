import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'

import { parseExpense } from '../api/ai'
import { createExpense, deleteExpense, expenseKeys, listExpenses, updateExpense } from '../api/expenses'
import { getHousehold, keys, listMembers } from '../api/households'
import { ApiError } from '../api/client'
import { listRecurring, recurringKeys, stopRecurring } from '../api/recurring'
import type { Category, Expense, ExpenseInput } from '../api/types'
import { CATEGORIES } from '../lib/categories'
import AiComposer from '../components/AiComposer'
import ExpenseForm from '../components/ExpenseForm'
import type { ExpenseFormHandle } from '../components/ExpenseForm'
import ExpenseFilters from '../components/ExpenseFilters'
import ExpenseList from '../components/ExpenseList'
import ExpenseTable from '../components/ExpenseTable'
import ExportCsvButton from '../components/ExportCsvButton'
import MonthTotals from '../components/MonthTotals'
import RecurringList from '../components/RecurringList'
import { warningMessage } from '../lib/aiWarnings'
import { errorMessage } from '../lib/errors'
import { today } from '../lib/date'
import { filterExpenses, isFiltered, monthNumber, monthsOf, monthTotals, NO_FILTER } from '../lib/expenseFilters'
import type { ExpenseFilter } from '../lib/expenseFilters'
import { readLastPayer, useMe, writeLastPayer } from '../lib/identity'
import { memberLooks } from '../lib/names'
import { formatVND } from '../lib/money'
import { useSession } from '../lib/session'
import { useToast } from '../lib/toast'
import { useWide } from '../lib/useWide'
import ErrorNote from '../components/ErrorNote'
import Skeleton from '../components/Skeleton'
import { useT } from '../i18n'

// US-03, US-04, US-05: record, list, edit and delete the expenses of one household
function ExpensesPage() {
  const t = useT()
  const householdId = Number(useParams().householdId)
  const wide = useWide()
  const queryClient = useQueryClient()
  const { me } = useMe()
  const session = useSession()
  const formRef = useRef<HTMLElement>(null)
  const [editing, setEditing] = useState<Expense | null>(null)
  // The AI fills this form; a new key clears the composer after each saved expense
  const expenseForm = useRef<ExpenseFormHandle>(null)
  const [composerKey, setComposerKey] = useState(0)
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  // "Xem" in the saved toast: the expense to scroll to and tint for a moment, and the rows on screen now.
  // Arriving from "Vì sao ra số này?" on Tổng quan (specs/002-balance-explanation) starts with that expense;
  // the page has just opened, so no filter can hide it
  const arrival = location.state as {
    revealExpense?: number
    month?: string
    category?: Category
    recordItem?: number
  } | null
  const revealExpense = arrival?.revealExpense
  // "Xem các khoản chi tháng này" in a monthly report (specs/004-monthly-report) starts on that month; a
  // month with no expense is dropped below, like any month that no longer filters anything
  const startMonth = arrival?.month
  // A line of "Chi theo danh mục" in the report (specs/005-expense-categories) adds its category
  const startCategory = arrival?.category
  // "Ghi luôn" on Tổng quan (specs/007-recurring-expenses): the form opens filled from that item
  const startRecording = arrival?.recordItem
  const [recordingId, setRecordingId] = useState<number | null>(startRecording ?? null)
  const [revealId, setRevealId] = useState<number | null>(revealExpense ?? null)
  const onScreen = useRef(new Set<number>())
  // The list filter belongs to one household: another household starts unfiltered
  const [filterOf, setFilterOf] = useState<{ householdId: number; filter: ExpenseFilter }>({
    householdId,
    filter: { ...NO_FILTER, month: startMonth ?? null, category: startCategory ?? null },
  })

  const members = useQuery({
    queryKey: keys.members(householdId),
    queryFn: () => listMembers(householdId),
  })
  const expenses = useQuery({
    queryKey: expenseKeys.list(householdId),
    queryFn: () => listExpenses(householdId),
  })
  const recurring = useQuery({
    queryKey: recurringKeys.list(householdId),
    queryFn: () => listRecurring(householdId),
  })
  const recordingItem =
    recordingId === null ? null : (recurring.data?.find((item) => item.id === recordingId) ?? null)
  // The same query HouseholdLayout already runs, so its cache answers and no request is sent twice
  const household = useQuery({
    queryKey: keys.household(householdId),
    queryFn: () => getHousehold(householdId),
  })

  // An expense changes the balances too: refetch everything cached under this household
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.household(householdId) })
  // Saved: said in a toast, since on a phone the new row lands below the screen (UI review 04/11)
  function saved(expense: Expense) {
    toast({
      text: t.expenses.saved(expense.description, formatVND(expense.amount)),
      action: { label: t.expenses.show, onAction: () => reveal(expense.id) },
    })
  }
  function reveal(id: number) {
    // A filter hiding it is lifted first
    if (!onScreen.current.has(id)) setFilter(NO_FILTER)
    setRevealId(id)
  }
  const create = useMutation({
    mutationFn: (input: ExpenseInput) => createExpense(householdId, input),
    onSuccess: (expense, input) => {
      writeLastPayer(householdId, input.payer_id)
      setComposerKey((key) => key + 1)
      // Recorded: the next expense is an ordinary one again
      if (input.recurring_item_id !== undefined) setRecordingId(null)
      saved(expense)
      return refresh()
    },
  })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: ExpenseInput }) => updateExpense(id, input, householdId),
    onSuccess: (expense) => {
      setEditing(null)
      saved(expense)
      return refresh()
    },
  })
  const stop = useMutation({
    mutationFn: stopRecurring,
    onSuccess: () => refresh(),
  })
  const remove = useMutation({
    mutationFn: (expense: Expense) => deleteExpense(expense.id, householdId),
    onSuccess: (_result, expense) => {
      // The expense being edited is gone: back to adding a new one
      setEditing((current) => (current?.id === expense.id ? null : current))
      return refresh()
    },
  })

  function startEditing(expense: Expense) {
    update.reset()
    setEditing(expense)
    // Smooth only for those who have not asked the system for less motion
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    formRef.current?.scrollIntoView?.({ behavior: still ? 'auto' : 'smooth', block: 'start' })
  }

  const noMembers = members.isSuccess && members.data.length === 0

  // "+ Ghi khoản chi" on Tổng quan opens this page ready to type: the description has the focus once the
  // form is there, and the request is dropped so going back and forth does not move the focus again
  const wantsDescription = (location.state as { focus?: string } | null)?.focus === 'description'
  useEffect(() => {
    if (!wantsDescription || !members.isSuccess) return
    expenseForm.current?.focusDescription()
    navigate(location.pathname, { replace: true, state: null })
  }, [wantsDescription, members.isSuccess, navigate, location.pathname])
  const looks = useMemo(() => memberLooks(members.data ?? []), [members.data])
  // Names from before accounts that nobody has taken (role null) stay in old expenses only (M3)
  const withAccount = useMemo(() => (members.data ?? []).filter((m) => m.role !== null), [members.data])
  // You, else whoever paid last on this device (DESIGN.md §6.3)
  const defaultPayer = me ?? readLastPayer(householdId)
  const form = editing ? update : create
  // "Kỳ 11/2026 của Tiền nhà đã có người ghi": said with the month and the item, and the way to it
  const taken =
    form.error instanceof ApiError && form.error.code === 'recurring_month_taken'
      ? (form.error.details as { expense_id?: number | null } | undefined)?.expense_id ?? null
      : null
  const takenInput = editing ? update.variables?.input : create.variables
  const takenItem = editing ? editing.recurring_item_id : takenInput?.recurring_item_id
  const takenName = recurring.data?.find((item) => item.id === takenItem)?.description ?? takenInput?.description ?? ''

  const allExpenses = useMemo(() => expenses.data ?? [], [expenses.data])
  const months = useMemo(() => monthsOf(allExpenses), [allExpenses])
  const chosen = filterOf.householdId === householdId ? filterOf.filter : NO_FILTER
  // A month whose last expense was deleted, or a member who left, no longer filters anything
  const filter: ExpenseFilter = {
    month: chosen.month !== null && months.includes(chosen.month) ? chosen.month : null,
    memberId: (members.data ?? []).some((m) => m.id === chosen.memberId) ? chosen.memberId : null,
    category: chosen.category !== null && CATEGORIES.includes(chosen.category) ? chosen.category : null,
  }
  const setFilter = (next: ExpenseFilter) => setFilterOf({ householdId, filter: next })
  const shown = filterExpenses(allExpenses, filter)
  // Revealed once: going back and forth does not reveal it or filter on the month again
  useEffect(() => {
    const handedOver = [revealExpense, startMonth, startCategory, startRecording].some((v) => v !== undefined)
    if (handedOver) navigate(location.pathname, { replace: true, state: null })
  }, [revealExpense, startMonth, startCategory, startRecording, navigate, location.pathname])
  useEffect(() => {
    onScreen.current = new Set(shown.map((expense) => expense.id))
  })
  // Scroll to the revealed row once it is on screen, tint it, and let the tint go after a moment
  useEffect(() => {
    if (revealId === null) return
    const row = document.querySelector<HTMLElement>(`[data-expense="${revealId}"]`)
    if (!row) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    row.scrollIntoView?.({ behavior: still ? 'auto' : 'smooth', block: 'center' })
    const done = setTimeout(() => setRevealId(null), 2000)
    return () => clearTimeout(done)
  }, [revealId, shown.length])
  const totals =
    filter.month === null
      ? null
      : monthTotals(filterExpenses(allExpenses, { ...NO_FILTER, month: filter.month }), members.data ?? [])

  return (
    <>
      <h2 className="visually-hidden">{t.expenses.title}</h2>

      {/* On a computer the form stays on the left and the list gets the width on the right */}
      <div className="page-split expenses-split">
        <div className="split-lead">
          {members.isPending && <Skeleton rows={4} label={t.expenses.loadingForm} />}
          {members.error && (
            <ErrorNote
              message={errorMessage(members.error) ?? ''}
              onRetry={() => members.refetch()}
              retrying={members.isFetching}
            />
          )}
          {noMembers && (
            <p>
              {t.expenses.noMembers(<Link to="../members">{t.expenses.addMembers}</Link>)}
            </p>
          )}

          {members.isSuccess && !noMembers && (
            // One surface to add an expense: the AI line first (the quick way, and the demo), then the
            // fields it fills. Two sibling forms inside it (DESIGN.md §6.3)
            <section ref={formRef} aria-labelledby="expense-form-title">
              <div className="section-head">
                <h2 id="expense-form-title">{editing ? t.expenses.editing(editing.description) : t.expenses.add}</h2>
                {/* A phone has the list two screens down; a computer shows it beside the form */}
                {!editing && !wide && (
                  <a href="#expense-list-title" className="section-link">
                    {t.expenses.jumpToList}
                  </a>
                )}
              </div>
              <div className="entry-card">
                {!editing && (
                  <AiComposer
                    // A new household or a saved expense starts a fresh composer; pending answers are dropped
                    key={`${householdId}-${composerKey}`}
                    members={members.data}
                    onParse={(text) => parseExpense(householdId, text)}
                    onDraft={(draft, warnings) =>
                      expenseForm.current?.fill({
                        description: draft.description,
                        amount: draft.amount,
                        payer_id: draft.payer_id,
                        spent_at: draft.spent_at,
                        member_ids: draft.split.member_ids,
                      splitNote: warnings.some((w) => w.code === 'participants_assumed')
                        ? warningMessage({ code: 'participants_assumed', message: '' })
                        : null,
                      }) ?? { filled: [], kept: [], cleared: [] }
                    }
                    onUndo={() => expenseForm.current?.undoFill()}
                    onManual={() => expenseForm.current?.focusDescription()}
                  />
                )}
                <ExpenseForm
                  ref={expenseForm}
                  // A new key gives the form fresh state for each household and each expense it edits
                  key={`${householdId}-${editing?.id ?? (recordingItem ? `item-${recordingItem.id}` : 'new')}`}
                  // A new expense is shared only between people with an account; an old one keeps its people
                  members={editing ? members.data : withAccount}
                  looks={looks}
                  me={me}
                  defaultPayer={defaultPayer}
                  initial={editing}
                  fromItem={editing ? null : recordingItem}
                  onSubmit={(input) =>
                    editing ? update.mutateAsync({ id: editing.id, input }) : create.mutateAsync(input)
                  }
                  onCancel={editing ? () => setEditing(null) : undefined}
                  submitting={form.isPending}
                  error={form.error instanceof ApiError && form.error.code === 'recurring_month_taken' ? null : errorMessage(form.error)}
                />
                {form.error instanceof ApiError && form.error.code === 'recurring_month_taken' && (
                  <p className="note" role="alert">
                    {t.recurring.taken(monthNumber((takenInput?.spent_at ?? today()).slice(0, 7)), takenName)}
                    {taken !== null && (
                      <button type="button" className="btn-ghost" onClick={() => reveal(taken)}>
                        {t.recurring.seeTaken}
                      </button>
                    )}
                  </p>
                )}
              </div>
            </section>
          )}
          {/* What recurs, and Ngừng lặp for its creator or the owner (specs/007-recurring-expenses) */}
          {recurring.isSuccess && expenses.isSuccess && (
            <RecurringList
              items={recurring.data}
              expenses={expenses.data}
              today={today()}
              looks={looks}
              canStop={(item) => household.data?.role === 'owner' || item.created_by === session?.user.id}
              onStop={(item) =>
                stop.mutate(item.id, { onSuccess: () => toast({ text: t.recurring.stopped(item.description) }) })
              }
              stoppingId={stop.isPending ? (stop.variables ?? null) : null}
            />
          )}
        </div>

        <div className="split-rest">
          <section aria-labelledby="expense-list-title">
            <div className="section-head list-head">
              <h2 id="expense-list-title" tabIndex={-1}>
                {t.expenses.listTitle}
              </h2>
              <span className="section-note" aria-live="polite">
                {isFiltered(filter)
                  ? t.expenses.filteredCount(shown.length, allExpenses.length)
                  : wide
                    ? t.expenses.listHintWide
                    : t.expenses.listHint}
              </span>
              {/* The whole household, whatever the filter: the file is the record, not the current view */}
              <ExportCsvButton
                expenses={expenses.data ?? []}
                members={members.data ?? []}
                householdName={household.data?.name ?? ''}
              />
            </div>
            {allExpenses.length > 0 && (
              <ExpenseFilters months={months} members={members.data ?? []} filter={filter} onChange={setFilter} />
            )}
            {totals && filter.month && (
              <MonthTotals month={filter.month} totals={totals} looks={looks} me={me} highlight={filter.memberId} />
            )}
            {isFiltered(filter) && shown.length === 0 ? (
              <p className="empty">
                {t.expenses.noMatch}{' '}
                <button type="button" className="ghost" onClick={() => setFilter(NO_FILTER)}>
                  {t.expenses.showAll}
                </button>
              </p>
            ) : wide ? (
              // A computer reads them as a table (DESIGN.md §6.6); a phone keeps the rows that open
              <ExpenseTable
                expenses={shown}
                members={members.data ?? []}
                looks={looks}
                loading={expenses.isPending}
                error={errorMessage(expenses.error ?? remove.error)}
                // Thử lại reloads the list; a failed delete is retried from its row
                onRetry={expenses.error ? () => expenses.refetch() : undefined}
                retrying={expenses.isFetching}
                onEdit={startEditing}
                onDelete={(expense) => remove.mutate(expense)}
                deletingId={remove.isPending ? remove.variables?.id : null}
                canChange={(expense) => household.data?.role === 'owner' || expense.created_by === session?.user.id}
                editingId={editing?.id ?? null}
                highlightId={revealId}
              />
            ) : (
              <ExpenseList
                expenses={shown}
                members={members.data ?? []}
                looks={looks}
                loading={expenses.isPending}
                error={errorMessage(expenses.error ?? remove.error)}
                // Thử lại reloads the list; a failed delete is retried from its row
                onRetry={expenses.error ? () => expenses.refetch() : undefined}
                retrying={expenses.isFetching}
                onEdit={startEditing}
                onDelete={(expense) => remove.mutate(expense)}
                deletingId={remove.isPending ? remove.variables?.id : null}
                canChange={(expense) => household.data?.role === 'owner' || expense.created_by === session?.user.id}
                highlightId={revealId}
              />
            )}
          </section>
        </div>
      </div>
    </>
  )
}

export default ExpensesPage
