// Built once: creating an Intl.NumberFormat is far slower than calling format()
const digits = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

// A real minus sign (U+2212), not a hyphen: it lines up with "+" and reads as a sign (DESIGN.md §5)
const MINUS = '−'

/** Whole đồng the way Vietnamese write it (docs/DESIGN.md §7): 240000 → "240.000đ", −50000 → "−50.000đ". */
export function formatVND(amount: number): string {
  const text = `${digits.format(Math.abs(amount))}đ`
  return amount < 0 ? MINUS + text : text
}

/** With an explicit sign for balances: "+200.000đ", "−120.000đ", "0đ". */
export function formatSignedVND(amount: number): string {
  return amount > 0 ? `+${formatVND(amount)}` : formatVND(amount)
}
