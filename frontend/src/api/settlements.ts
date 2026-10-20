// Settlements and balances endpoints, exactly as listed in docs/ARCHITECTURE.md §5
import { api } from './client'
import type { Balances, Settlement, SettlementInput } from './types'

/** Nested under ['households', id], like the expenses, so one invalidation refreshes them all. */
export const settlementKeys = {
  list: (householdId: number) => ['households', householdId, 'settlements'] as const,
  balances: (householdId: number) => ['households', householdId, 'balances'] as const,
}

export const listSettlements = (householdId: number) =>
  api.get<Settlement[]>(`/api/households/${householdId}/settlements`)

export const createSettlement = (householdId: number, input: SettlementInput) =>
  api.post<Settlement>(`/api/households/${householdId}/settlements`, input)

/** There is no edit: a mistaken settlement is deleted and entered again. */
export const deleteSettlement = (id: number) => api.delete(`/api/settlements/${id}`)

export const getBalances = (householdId: number) =>
  api.get<Balances>(`/api/households/${householdId}/balances`)
