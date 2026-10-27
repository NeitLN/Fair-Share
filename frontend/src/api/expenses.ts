// Expenses endpoints, exactly as listed in docs/ARCHITECTURE.md §5
import { api } from './client'
import type { Expense, ExpenseInput } from './types'

/**
 * Cache key, nested under ['households', id]: invalidating the household after a change refreshes
 * its expenses and its balances in one go.
 */
export const expenseKeys = {
  list: (householdId: number) => ['households', householdId, 'expenses'] as const,
}

export const listExpenses = (householdId: number) =>
  api.get<Expense[]>(`/api/households/${householdId}/expenses`)

export const createExpense = (householdId: number, input: ExpenseInput) =>
  api.post<Expense>(`/api/households/${householdId}/expenses`, input)

export const updateExpense = (id: number, input: ExpenseInput, householdId: number) =>
  api.put<Expense>(`/api/expenses/${id}`, input, householdId)

export const deleteExpense = (id: number, householdId: number) =>
  api.delete(`/api/expenses/${id}`, householdId)
