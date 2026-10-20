// The same equal-split rule as the API (app/services/splitting.py), so the form can show each
// person's share before saving: everyone gets amount // n, and the amount % n đồng left over go
// one each to the participants with the lowest member ids. The shares always add up exactly.
export function equalSplit(amount: number, memberIds: number[]): Map<number, number> {
  const ids = [...new Set(memberIds)].sort((a, b) => a - b)
  const shares = new Map<number, number>()
  if (ids.length === 0) return shares
  const base = Math.floor(amount / ids.length)
  const remainder = amount % ids.length
  ids.forEach((id, i) => shares.set(id, base + (i < remainder ? 1 : 0)))
  return shares
}

/**
 * What the user typed in a money field, as whole đồng, or null when it is not a usable amount.
 * Accepts "240000", "240.000", "240 000", "1,500,000" (dots or commas grouping thousands) and the
 * everyday "240k" or "12.5k" (thousands; there the dot or comma is a decimal point).
 */
export function parseAmount(text: string): number | null {
  const compact = text.trim().toLowerCase().replace(/[\s_]/g, '')
  let value: number
  const thousands = /^(\d+)(?:[.,](\d{1,3}))?k$/.exec(compact)
  if (thousands) {
    const fraction = (thousands[2] ?? '').padEnd(3, '0')
    value = Number(thousands[1]) * 1000 + Number(fraction)
  } else if (/^\d+$/.test(compact) || /^\d{1,3}([.,]\d{3})+$/.test(compact)) {
    value = Number(compact.replace(/[.,]/g, ''))
  } else {
    return null
  }
  return Number.isSafeInteger(value) ? value : null
}
