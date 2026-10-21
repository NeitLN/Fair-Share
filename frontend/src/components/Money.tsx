import { formatSignedVND, formatVND } from '../lib/money'

interface MoneyProps {
  amount: number
  /** "balance": a + or − sign and the credit/debt colour; the words next to it carry the meaning. */
  kind?: 'plain' | 'balance'
  className?: string
}

/**
 * An amount in đồng, bold with figures of equal width, the "đ" smaller and never wrapped away from
 * its number (docs/DESIGN.md §2 rule 3). The text is the same string formatVND gives.
 */
export function Money({ amount, kind = 'plain', className }: MoneyProps) {
  const text = kind === 'balance' ? formatSignedVND(amount) : formatVND(amount)
  const tone = kind === 'balance' ? (amount > 0 ? ' credit-text' : amount < 0 ? ' debt-text' : '') : ''
  return (
    <span className={`money${tone}${className ? ` ${className}` : ''}`}>
      {text.slice(0, -1)}
      <span className="cur">đ</span>
    </span>
  )
}
