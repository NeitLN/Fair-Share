import type { DraftWarning } from '../api/types'
import { messages } from '../i18n'
import { formatVND } from './money'

/**
 * A sentence in the page's language for one warning in an AI draft. Known codes say what to fix in the form;
 * anything else falls back to the server's own text.
 */
export function warningMessage(warning: DraftWarning): string {
  const t = messages().ai
  const money = (amount: number | null | undefined) => formatVND(amount ?? 0)
  switch (warning.code) {
    case 'unknown_member':
      return warning.name
        ? t.unknownMember(warning.name)
        : warning.message
    case 'no_payer':
      return t.noPayer
    case 'no_amount':
      return t.noAmount
    case 'participants_assumed':
      return t.participantsAssumed
    // Why named amounts could not be placed (specs/009-ai-custom-split)
    case 'over_total':
      return warning.named_sum != null && warning.total != null
        ? t.overTotal(money(warning.named_sum), money(warning.total))
        : warning.message
    case 'ambiguous_member':
      return warning.name ? t.ambiguousMember(warning.name) : warning.message
    case 'duplicate_member':
      return warning.name ? t.duplicateMember(warning.name) : warning.message
    case 'no_rest_taker':
      return warning.remainder != null ? t.noRestTaker(money(warning.remainder)) : warning.message
    case 'nobody_for_equal_rest':
      return warning.remainder != null ? t.nobodyForEqualRest(money(warning.remainder)) : warning.message
    case 'no_total':
      return t.noTotal
    case 'fraction_or_percent':
      return t.fractionOrPercent
    case 'several_payers':
      return t.severalPayers
    case 'paid_amount':
      return t.paidAmount
    case 'payer_not_sharing':
      return t.payerNotSharing
    case 'unreadable_shares':
      return t.unreadableShares
    default:
      return warning.message
  }
}
