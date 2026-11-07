// Households, members, invite codes and accounts endpoints (docs/ARCHITECTURE.md §5, docs/ACCOUNTS.md)
import { api, KEY_HEADER } from './client'
import type {
  ClaimInfo,
  InviteCode,
  JoinRequest,
  JoinResult,
  Member,
  MyHousehold,
  MyHouseholds,
  RenameResult,
  Session,
  User,
} from './types'

/** React Query cache keys: invalidate a key after a change and every page using it refetches. */
export const keys = {
  households: ['households'] as const,
  household: (id: number) => ['households', id] as const,
  members: (householdId: number) => ['households', householdId, 'members'] as const,
  invite: (householdId: number) => ['households', householdId, 'invite'] as const,
  requests: (householdId: number) => ['households', householdId, 'requests'] as const,
}

// --- Account ------------------------------------------------------------------------------------

export const register = (email: string, password: string, displayName: string) =>
  api.post<Session>('/api/auth/register', { email, password, display_name: displayName })

export const login = (email: string, password: string) =>
  api.post<Session>('/api/auth/login', { email, password })

export const logout = () => api.post<void>('/api/auth/logout', {})

export const getMe = () => api.get<User>('/api/auth/me')

/** The display name and the person's own name in every household (specs/010-profile-page). */
export const renameMe = (displayName: string) =>
  api.patch<RenameResult>('/api/me', { display_name: displayName })

/** A short status housemates see, or null to clear it. */
export const setStatus = (status: string | null) => api.put<User>('/api/me/status', { status })

/** A wrong current password is a 400 `wrong_password`, not a 401, so it never signs out. */
export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post<void>('/api/me/password', { current_password: currentPassword, new_password: newPassword })

// --- Households -----------------------------------------------------------------------------------

/** The signed-in user's households, and their requests to join still waiting. */
export const listMyHouseholds = () => api.get<MyHouseholds>('/api/households')

export const getHousehold = (id: number) => api.get<MyHousehold>(`/api/households/${id}`)

/** The creator becomes its owner, with their display name in the split. */
export const createHousehold = (name: string) => api.post<MyHousehold>('/api/households', { name })

/** The owner renames the house (1 to 60 characters). */
export const renameHousehold = (id: number, name: string) =>
  api.patch<MyHousehold>(`/api/households/${id}`, { name }, id)

export const leaveHousehold = (id: number) => api.post<void>(`/api/households/${id}/leave`, {})

export const listMembers = (householdId: number) =>
  api.get<Member[]>(`/api/households/${householdId}/members`)

export const renameMember = (id: number, name: string, householdId: number) =>
  api.patch<Member>(`/api/members/${id}`, { name }, householdId)

export const removeMember = (id: number, householdId: number) =>
  api.delete(`/api/members/${id}`, householdId)

// --- Joining ------------------------------------------------------------------------------------

export const getInvite = (householdId: number) =>
  api.get<InviteCode>(`/api/households/${householdId}/invite`)

export const renewInvite = (householdId: number) =>
  api.post<InviteCode>(`/api/households/${householdId}/invite`, {})

export const join = (code: string) => api.post<JoinResult>('/api/join', { code })

export const cancelRequest = (householdId: number) => api.delete(`/api/me/requests/${householdId}`)

export const listRequests = (householdId: number) =>
  api.get<JoinRequest[]>(`/api/households/${householdId}/requests`)

/** Onto a name nobody has (`memberId`), or a new name (their display name, or `name`). */
export const approveRequest = (
  householdId: number,
  userId: number,
  choice: { member_id?: number; name?: string } = {},
) => api.post<Member>(`/api/households/${householdId}/requests/${userId}/approve`, choice)

export const rejectRequest = (householdId: number, userId: number) =>
  api.post<void>(`/api/households/${householdId}/requests/${userId}/reject`, {})

export const removePerson = (householdId: number, userId: number) =>
  api.delete(`/api/households/${householdId}/people/${userId}`)

// --- Taking over a household from before accounts --------------------------------------------------

export const getClaim = (householdId: number, key: string) =>
  api.get<ClaimInfo>(`/api/households/${householdId}/claim`, undefined, { [KEY_HEADER]: key })

export const claim = (householdId: number, key: string, memberId: number | null) =>
  api.post<void>(
    `/api/households/${householdId}/claim`,
    memberId === null ? {} : { member_id: memberId },
    undefined,
    { [KEY_HEADER]: key },
  )
