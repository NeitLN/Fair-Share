import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router'

import { parseExpense } from '../api/ai'
import { createExpense, deleteExpense, expenseKeys, listExpenses, updateExpense } from '../api/expenses'
import { keys, listMembers } from '../api/households'
import type { Expense, ExpenseInput } from '../api/types'
import AiComposer from '../components/AiComposer'
import ExpenseForm from '../components/ExpenseForm'
import type { ExpenseFormHandle } from '../components/ExpenseForm'
import ExpenseList from '../components/ExpenseList'
import { errorMessage } from '../lib/errors'

// US-03, US-04, US-05: record, list, edit and delete the expenses of one household
function ExpensesPage() {
  const householdId = Number(useParams().householdId)
  const queryClient = useQueryClient()
  const formRef = useRef<HTMLElement>(null)
  const [editing, setEditing] = useState<Expense | null>(null)
  // The AI fills this form; a new key clears the composer after each saved expense
  const expenseForm = useRef<ExpenseFormHandle>(null)
  const [composerKey, setComposerKey] = useState(0)

  const members = useQuery({
    queryKey: keys.members(householdId),
    queryFn: () => listMembers(householdId),
  })
  const expenses = useQuery({
    queryKey: expenseKeys.list(householdId),
    queryFn: () => listExpenses(householdId),
  })

  // An expense changes the balances too: refetch everything cached under this household
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.household(householdId) })
  const create = useMutation({
    mutationFn: (input: ExpenseInput) => createExpense(householdId, input),
    onSuccess: () => {
      setComposerKey((key) => key + 1)
      return refresh()
    },
  })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: ExpenseInput }) => updateExpense(id, input),
    onSuccess: () => {
      setEditing(null)
      return refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (expense: Expense) => deleteExpense(expense.id),
    onSuccess: (_result, expense) => {
      // The expense being edited is gone: back to adding a new one
      setEditing((current) => (current?.id === expense.id ? null : current))
      return refresh()
    },
  })

  function startEditing(expense: Expense) {
    update.reset()
    setEditing(expense)
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  const noMembers = members.isSuccess && members.data.length === 0
  const form = editing ? update : create

  return (
    <>
      <h1>Chi tiêu</h1>

      {members.isPending && <p>Đang tải thành viên…</p>}
      {members.error && <p role="alert">{errorMessage(members.error)}</p>}
      {noMembers && (
        <p>
          Nhà chưa có thành viên. <Link to="../members">Thêm thành viên</Link> trước khi ghi
          khoản chi.
        </p>
      )}

      {members.isSuccess && !noMembers && (
        <>
          {!editing && (
            <AiComposer
              // A new household or a saved expense starts a fresh composer; pending answers are dropped
              key={`${householdId}-${composerKey}`}
              members={members.data}
              onParse={(text) => parseExpense(householdId, text)}
              onDraft={(draft) =>
                expenseForm.current?.fill({
                  description: draft.description,
                  amount: draft.amount,
                  payer_id: draft.payer_id,
                  spent_at: draft.spent_at,
                  member_ids: draft.split.member_ids,
                }) ?? { filled: [], kept: [], cleared: [] }
              }
              onUndo={() => expenseForm.current?.undoFill()}
              onManual={() => expenseForm.current?.focusDescription()}
            />
          )}
          <section ref={formRef} aria-labelledby="expense-form-title">
            <h2 id="expense-form-title">{editing ? `Sửa: ${editing.description}` : 'Thêm khoản chi'}</h2>
            <ExpenseForm
              ref={expenseForm}
              // A new key gives the form fresh state for each expense it edits
              key={editing?.id ?? 'new'}
              members={members.data}
              initial={editing}
              onSubmit={(input) =>
                editing ? update.mutateAsync({ id: editing.id, input }) : create.mutateAsync(input)
              }
              onCancel={editing ? () => setEditing(null) : undefined}
              submitting={form.isPending}
              error={errorMessage(form.error)}
            />
          </section>
        </>
      )}

      <section aria-labelledby="expense-list-title">
        <h2 id="expense-list-title">Các khoản chi</h2>
        <ExpenseList
          expenses={expenses.data ?? []}
          members={members.data ?? []}
          loading={expenses.isPending}
          error={errorMessage(expenses.error ?? remove.error)}
          onEdit={startEditing}
          onDelete={(expense) => remove.mutate(expense)}
          deletingId={remove.isPending ? remove.variables?.id : null}
        />
      </section>
    </>
  )
}

export default ExpensesPage
