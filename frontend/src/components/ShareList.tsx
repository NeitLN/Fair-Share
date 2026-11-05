import type { Expense } from '../api/types'
import { REMOVED_MEMBER } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { Avatar } from './Avatar'
import { Money } from './Money'
import { useT } from '../i18n'

interface ShareListProps {
  expense: Expense
  looks: Map<number, MemberLook>
}

/**
 * Who shares one expense and how much each (design review 05/11: "chia riêng 2 người" did not say
 * whether you were in it, or for how much). A share of 0 đồng is no part of it. Props only.
 */
function ShareList({ expense, looks }: ShareListProps) {
  const t = useT()
  return (
    <ul className="share-list" aria-label={t.expenses.sharesOf(expense.description)}>
      {expense.shares
        .filter((share) => share.amount > 0)
        .map((share) => {
          const look = looks.get(share.member_id) ?? REMOVED_MEMBER
          return (
            <li key={share.member_id}>
              <Avatar look={look} size="sm" decorative />
              <span className="share-name">{look.short}</span>
              <Money amount={share.amount} />
            </li>
          )
        })}
    </ul>
  )
}

export default ShareList
