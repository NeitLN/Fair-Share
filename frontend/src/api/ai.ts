// AI quick add: one sentence in, a draft expense out. Nothing is saved by this call.
import { api } from './client'
import type { AiDraft } from './types'

export const parseExpense = (householdId: number, text: string) =>
  api.post<AiDraft>(`/api/households/${householdId}/ai/parse-expense`, { text })
