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

// Every balances request gets a number when it starts. A payment remembers the count when it was
// recorded, so the dashboard knows which balances were asked for after it (lib/usePaidTransfers.ts).
let balancesFetches = 0

/** How many balances requests have started so far. */
export const balancesFetchCount = () => balancesFetches

export async function getBalances(householdId: number): Promise<Balances> {
  const fetchCount = ++balancesFetches
  const balances = await api.get<Balances>(`/api/households/${householdId}/balances`)
  return { ...balances, fetchCount }
}
