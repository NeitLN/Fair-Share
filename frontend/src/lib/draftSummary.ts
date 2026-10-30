import type { ExpenseDraft, Member } from '../api/types'
import { messages } from '../i18n'
import { formatVND } from './money'

/**
 * One sentence describing what the AI filled in, for the note above the form.
 * Parts the draft does not have (no amount, no payer) are left out.
 */
export function draftSummary(draft: ExpenseDraft, members: Member[]): string {
  const t = messages()
  const parts: string[] = []

  const description = draft.description.trim()
  if (description) parts.push(description)

  if (draft.amount !== null) parts.push(formatVND(draft.amount))

  if (draft.payer_id !== null) {
    const payer = members.find((member) => member.id === draft.payer_id)
    parts.push(t.ai.pays(payer?.name ?? t.common.removedMember))
  }

  // No ids: the split was not filled (the user had set it), so it is not mentioned
  const ids = draft.split.member_ids
  if (ids.length > 0) {
    const everyone =
      members.length > 0 &&
      ids.length === members.length &&
      members.every((member) => ids.includes(member.id))
    parts.push(
      everyone ? t.ai.splitEveryone(members.length) : t.ai.splitAmong(ids.length),
    )
  }

  return parts.length > 0 ? t.ai.filled(parts.join(' · ')) : ''
}
