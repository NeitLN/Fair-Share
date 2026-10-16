// Households and members endpoints, exactly as listed in docs/ARCHITECTURE.md §5
import { api } from './client'
import type { Household, Member } from './types'

/** React Query cache keys: invalidate a key after a change and every page using it refetches. */
export const keys = {
  households: ['households'] as const,
  household: (id: number) => ['households', id] as const,
  members: (householdId: number) => ['households', householdId, 'members'] as const,
}

export const listHouseholds = () => api.get<Household[]>('/api/households')

export const getHousehold = (id: number) => api.get<Household>(`/api/households/${id}`)

export const createHousehold = (name: string) =>
  api.post<Household>('/api/households', { name })

export const listMembers = (householdId: number) =>
  api.get<Member[]>(`/api/households/${householdId}/members`)

export const addMember = (householdId: number, name: string) =>
  api.post<Member>(`/api/households/${householdId}/members`, { name })

export const renameMember = (id: number, name: string) =>
  api.patch<Member>(`/api/members/${id}`, { name })

export const removeMember = (id: number) => api.delete(`/api/members/${id}`)
