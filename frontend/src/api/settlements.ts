// Settlements and balances endpoints, exactly as listed in docs/ARCHITECTURE.md §5
import { api } from './client'
import type { Balances, Notice, Settlement, SettlementInput } from './types'

/** Nested under ['households', id], like the expenses, so one invalidation refreshes them all. */
export const settlementKeys = {
  list: (householdId: number) => ['households', householdId, 'settlements'] as const,
  balances: (householdId: number) => ['households', householdId, 'balances'] as const,
  notices: (householdId: number) => ['households', householdId, 'notices'] as const,
}

// "Tôi đã chuyển" (docs/ACCOUNTS.md, S3). The sender is always the signed-in member.
export const listNotices = (householdId: number) =>
  api.get<Notice[]>(`/api/households/${householdId}/notices`)

// Every action names the version of the notice its screen showed (null: it showed none); a notice
// that changed since is not touched (409 notice_changed). specs/014-partial-transfer-notices.
export const sendNotice = (householdId: number, toMemberId: number, amount: number, version: number | null) =>
  api.put<Notice>(`/api/households/${householdId}/notices`, { to_member_id: toMemberId, amount, version })

export const cancelNotice = (householdId: number, toMemberId: number, version: number) =>
  api.delete(`/api/households/${householdId}/notices/${toMemberId}?version=${version}`)

/** "Đã nhận": `received` arrived (all of the notice, or less with "Nhận số khác"). */
export const acceptNotice = (
  householdId: number,
  fromMemberId: number,
  answer: { version: number; received: number; settledAt: string },
) =>
  api.post<Settlement>(`/api/households/${householdId}/notices/${fromMemberId}/accept`, {
    version: answer.version,
    received: answer.received,
    settled_at: answer.settledAt,
  })

export const declineNotice = (householdId: number, fromMemberId: number, version: number) =>
  api.post<Notice>(`/api/households/${householdId}/notices/${fromMemberId}/decline`, { version })

export const listSettlements = (householdId: number) =>
  api.get<Settlement[]>(`/api/households/${householdId}/settlements`)

export const createSettlement = (householdId: number, input: SettlementInput) =>
  api.post<Settlement>(`/api/households/${householdId}/settlements`, input)

/** There is no edit: a mistaken settlement is deleted and entered again. */
export const deleteSettlement = (id: number, householdId: number) =>
  api.delete(`/api/settlements/${id}`, householdId)

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
