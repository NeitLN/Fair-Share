import type { Category, SplitType } from '../api/types'
import type { FillField } from '../components/ExpenseForm'

/**
 * A new expense being typed, kept in this tab (sessionStorage) so a reload, or a session that ended and
 * a sign-in again, does not lose it (review 12/11, E10/F16; specs/020 left keeping a draft across a reload
 * to this). Its identity is kept too, so a save whose answer was lost, pressed again after a reload, still
 * gets the expense it made back instead of a second one.
 *
 * Kept per account and household: another person signing in on the same tab never sees it. Never in
 * localStorage, so it does not outlive the tab. Storage that is blocked just keeps nothing.
 */
export interface KeptDraft {
  draftId: string
  description: string
  amountText: string
  payerId: number | ''
  payerIsDefault: boolean
  spentAt: string
  splitType: SplitType
  selected: number[]
  customText: Record<number, string>
  pickedCategory: Category | null
  repeat: boolean
  varying: boolean
  touched: FillField[]
}

export const keptDraftKey = (userId: number, householdId: number) => `fair-share:expense-draft:${userId}:${householdId}`

export function readKept(key: string): KeptDraft | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    return value && typeof value.description === 'string' && typeof value.amountText === 'string'
      ? (value as KeptDraft)
      : null
  } catch {
    return null
  }
}

/** Forgets every kept draft of this tab: after a deliberate Đăng xuất (lib/session.ts; review of #301). */
export function forgetAllKept() {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('fair-share:expense-draft:')) sessionStorage.removeItem(key)
    }
  } catch {
    // Storage blocked: nothing was kept
  }
}

/** Keeps `draft`, or forgets it when nothing has been typed (null). */
export function writeKept(key: string, draft: KeptDraft | null) {
  try {
    if (draft) sessionStorage.setItem(key, JSON.stringify(draft))
    else sessionStorage.removeItem(key)
  } catch {
    // Storage blocked: nothing is kept
  }
}
