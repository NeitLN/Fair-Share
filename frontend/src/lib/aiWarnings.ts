import type { DraftWarning } from '../api/types'
import { messages } from '../i18n'

/**
 * A sentence in the page's language for one warning in an AI draft. Known codes say what to fix in the form;
 * anything else falls back to the server's own text.
 */
export function warningMessage(warning: DraftWarning): string {
  const t = messages().ai
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
    default:
      return warning.message
  }
}
