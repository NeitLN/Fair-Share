import type { AiDraft, DraftWarning } from '../api/types'
import type { FormFill } from '../components/ExpenseForm'
import { warningMessage } from './aiWarnings'

/** What an AI draft puts in the expense form (US-09; named amounts: specs/009-ai-custom-split). */
export function draftToFill(draft: AiDraft['draft'], warnings: DraftWarning[]): FormFill {
  const split = draft.split
  const base: FormFill = {
    description: draft.description,
    amount: draft.amount,
    payer_id: draft.payer_id,
    spent_at: draft.spent_at,
  }
  if (split.type === 'custom') {
    return {
      ...base,
      custom: {
        shares: split.shares,
        restTo: split.rest_to,
        restAmount: split.rest_amount,
        restToPayer: split.rest_to_payer,
      },
    }
  }
  if (split.type === 'blocked') {
    const why = warnings.find((w) => w.code === split.reason)
    return {
      ...base,
      blocked: {
        preview: split.preview,
        message: warningMessage(why ?? { code: split.reason, message: '' }),
      },
    }
  }
  return {
    ...base,
    member_ids: split.member_ids,
    splitNote: warnings.some((w) => w.code === 'participants_assumed')
      ? warningMessage({ code: 'participants_assumed', message: '' })
      : null,
  }
}
