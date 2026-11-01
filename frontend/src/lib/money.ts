import { language } from '../i18n'

// Built once: creating an Intl.NumberFormat is far slower than calling format()
const digits = {
  vi: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }),
  en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
}

// A real minus sign (U+2212), not a hyphen: it lines up with "+" and reads as a sign (DESIGN.md §5)
const MINUS = '−'

/**
 * Whole đồng (docs/DESIGN.md §7), written the way the page's language writes it: 240000 →
 * "240.000đ" in Vietnamese, "240,000 ₫" in English (a no-break space, so the sign never wraps
 * away). −50000 → "−50.000đ". The currency is always the last character.
 */
export function formatVND(amount: number): string {
  const lang = language()
  const number = digits[lang].format(Math.abs(amount))
  const text = lang === 'en' ? `${number}\u00a0₫` : `${number}đ`
  return amount < 0 ? MINUS + text : text
}

/** With an explicit sign for balances: "+200.000đ", "−120.000đ", "0đ". */
export function formatSignedVND(amount: number): string {
  return amount > 0 ? `+${formatVND(amount)}` : formatVND(amount)
}
