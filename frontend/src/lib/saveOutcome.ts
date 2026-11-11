import { ApiError } from '../api/client'
import type { Messages } from '../i18n/vi'

/**
 * The money writes of specs/018 (contracts/ui-contract.md §1): A1 an expense, A2 a repayment by hand,
 * A3 telling, A4 taking a notice back, A5 answering a notice, A6 undoing a confirmation, A7 deleting.
 */
export type SaveAction = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7'

/** What is known about a failed write: never sent (offline), sent with no full answer, or anything else. */
export type Outcome = 'offline' | 'unknown' | 'other'

export function outcomeOf(error: unknown): Outcome {
  if (!(error instanceof ApiError)) return 'other'
  if (error.code === 'offline') return 'offline'
  if (error.code === 'outcome_unknown') return 'unknown'
  return 'other'
}

/**
 * The line a write shows in its usual error place (FR-016), or null when today's message stays. An
 * unknown line is shown alone, never after a prefix that says it failed (FR-016a).
 */
export function outcomeLine(action: SaveAction, error: unknown, t: Messages): string | null {
  const outcome = outcomeOf(error)
  return outcome === 'other' ? null : t.save[action][outcome]
}

/** True when the line from outcomeLine() is the unknown one, which callers show without their prefix. */
export const isUnknown = (error: unknown) => outcomeOf(error) === 'unknown'

/** The record a draft already made, when the server refused a press that says something else. */
export interface SavedDraft {
  kind: 'expense' | 'settlement'
  id: number
}

/**
 * specs/020-no-double-save, FR-009: this draft was already saved, as the record named, and this press
 * differs from its first one. Nothing was changed; the page offers "Xem" and "Ghi thành khoản mới".
 */
export function savedDraft(error: unknown): SavedDraft | null {
  if (!(error instanceof ApiError) || error.code !== 'draft_already_saved') return null
  const details = error.details as Partial<SavedDraft> | undefined
  if (typeof details?.id !== 'number' || (details.kind !== 'expense' && details.kind !== 'settlement')) return null
  return { kind: details.kind, id: details.id }
}
