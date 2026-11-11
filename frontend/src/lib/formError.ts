import { ApiError } from '../api/client'
import type { FillField } from '../components/ExpenseForm'
import { messages } from '../i18n'
import { errorMessage } from './errors'
import { outcomeLine } from './saveOutcome'

/**
 * A failed save of the expense form, as the form shows it (specs/011-first-impressions, FR-002, FR-003):
 * the message, and the field it is about so the form can focus it, or null for a failure that is not
 * about one field (network, unexpected server error). The month of a repeating item already recorded is
 * shown by the page with its own link, so it is not a form error at all.
 */
export interface FormError {
  message: string
  field: FillField | null
  /** A whole sentence already (offline, or result unknown): shown without "Chưa lưu được:" (specs/018, FR-016a). */
  alone?: boolean
}

// The body fields of POST/PUT expenses and the form field each one is typed in
const FIELD_OF: Record<string, FillField> = {
  description: 'description',
  amount: 'amount',
  payer_id: 'payer',
  spent_at: 'date',
  split: 'split',
}

// Refusals about who shares the expense, answered by the API without a field location
const SPLIT_CODES = new Set(['unknown_member', 'member_without_account'])

export function formError(error: unknown): FormError | null {
  if (!error) return null
  if (error instanceof ApiError && error.code === 'recurring_month_taken') return null
  // Not sent, or sent with no answer: say only that (specs/018, contracts/ui-contract.md §2, A1)
  const line = outcomeLine('A1', error, messages())
  if (line) return { message: line, field: null, alone: true }
  const message = errorMessage(error) ?? ''
  if (error instanceof ApiError) {
    if (SPLIT_CODES.has(error.code)) return { message, field: 'split' }
    if (error.code === 'validation_error' && Array.isArray(error.details)) {
      const loc = (error.details[0] as { loc?: unknown } | undefined)?.loc
      const name = Array.isArray(loc) ? loc.find((part) => typeof part === 'string' && part in FIELD_OF) : undefined
      if (typeof name === 'string') return { message, field: FIELD_OF[name] }
    }
  }
  return { message, field: null }
}
