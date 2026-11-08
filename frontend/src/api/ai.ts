// AI quick add: one sentence in, a draft expense out. Nothing is saved by this call.
import { request } from './client'
import type { AiDraft } from './types'

// Not counted for the slow-server notice: the AI is slow by nature and the composer says how long it has read
export const parseExpense = (householdId: number, text: string) =>
  request<AiDraft>(
    `/api/households/${householdId}/ai/parse-expense`,
    { method: 'POST', body: JSON.stringify({ text }) },
    { countsAsSlow: false },
  )
