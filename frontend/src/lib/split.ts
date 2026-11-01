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

// Thousands and millions the way amounts are written every day: "240k", "2tr", "2 triệu"
const UNITS: Record<string, number> = { k: 1_000, tr: 1_000_000, triệu: 1_000_000, trieu: 1_000_000 }
// A whole number, its unit, and an optional fraction before the unit ("1,5tr") or after it ("1tr5")
const WITH_UNIT = /^(\d+)(?:(?:[.,](\d+))?(k|tr|triệu|trieu)|(k|tr|triệu|trieu)(\d+))$/

/**
 * What the user typed in a money field, as whole đồng, or null when it is not a usable amount.
 * Accepts "240000", "240.000", "240 000", "1,500,000" (dots or commas grouping thousands), and
 * thousands or millions with a unit: "240k", "12.5k", "2tr", "1,5tr", "1tr5", "2 triệu". With a unit
 * the dot or comma is a decimal point, and digits after the unit are the fraction ("1tr5" is 1,5
 * triệu, "1tr250" 1,25 triệu, "1k5" 1 500 đồng).
 */
export function parseAmount(text: string): number | null {
  // NFC: "triệu" typed with combining accents is the same word
  const compact = text.normalize('NFC').trim().toLowerCase().replace(/[\s_]/g, '')
  let value: number
  const withUnit = WITH_UNIT.exec(compact)
  if (withUnit) {
    const [, whole, before, unitBefore, unitAfter, after] = withUnit
    const size = UNITS[unitBefore ?? unitAfter]
    const places = String(size).length - 1 // 3 for thousands, 6 for millions
    const fraction = before ?? after ?? ''
    // A fraction finer than one đồng ("1.2345k") is a typo, not an amount
    if (fraction.length > places) return null
    value = Number(whole) * size + Number(fraction.padEnd(places, '0'))
  } else if (/^\d+$/.test(compact) || /^\d{1,3}([.,]\d{3})+$/.test(compact)) {
    value = Number(compact.replace(/[.,]/g, ''))
  } else {
    return null
  }
  return Number.isSafeInteger(value) ? value : null
}
