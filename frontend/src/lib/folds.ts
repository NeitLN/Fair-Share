// Tổng quan in a busy house (plan G2-10): what is about you stays in view, the rest of the house folds
// behind a line that sums it up. Which folds are open is remembered per house on this device, and only
// as a convenience: without storage (private window, blocked site data) every fold starts closed.

/** From this many members a house is "busy" and Tổng quan folds the household's part (owner, 09/11). */
export const BUSY_HOUSE = 5

/** The folds of Tổng quan. */
export type FoldName = 'transfers' | 'month' | 'balances' | 'history'

const key = (householdId: number) => `fair-share:folds:${householdId}`

/** Whether `name` was left open in this house; false when unknown. */
export function foldOpen(householdId: number, name: FoldName): boolean {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key(householdId)) ?? '{}')
    return typeof saved === 'object' && saved !== null && (saved as Record<string, unknown>)[name] === true
  } catch {
    return false
  }
}

export function rememberFold(householdId: number, name: FoldName, open: boolean) {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key(householdId)) ?? '{}')
    const folds = typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : {}
    localStorage.setItem(key(householdId), JSON.stringify({ ...folds, [name]: open }))
  } catch {
    // Not remembered: the fold still works for this visit
  }
}
