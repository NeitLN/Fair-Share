// Recurring expenses (specs/007-recurring-expenses), as listed in docs/ARCHITECTURE.md §5. An item is
// made and recorded from through the expense routes; here only the list and "Ngừng lặp".
import { api } from './client'
import type { RecurringItem } from './types'

/** Nested under ['households', id], so one invalidation of the house refreshes it with the rest. */
export const recurringKeys = {
  list: (householdId: number) => ['households', householdId, 'recurring'] as const,
}

export const listRecurring = (householdId: number) =>
  api.get<RecurringItem[]>(`/api/households/${householdId}/recurring`)

export const stopRecurring = (id: number) => api.post<void>(`/api/recurring/${id}/stop`, {})
