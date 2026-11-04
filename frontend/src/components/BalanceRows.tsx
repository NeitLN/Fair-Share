import { useState } from 'react'
import type { ReactNode } from 'react'

import type { MemberBalance } from '../api/types'
import type { BalanceExplanation as Explanation } from '../lib/explain'
import { closeFoldOnEscape } from '../lib/fold'
import { initialOf } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { tookPart } from '../lib/verdict'
import { Avatar } from './Avatar'
import BalanceExplanation from './BalanceExplanation'
import { Chip, Stamp } from './Chip'
import { Money } from './Money'
import Skeleton from './Skeleton'
import { useT } from '../i18n'

interface BalanceRowsProps {
  /** One row per member, already ordered by member id. */
  balances: MemberBalance[]
  looks: Map<number, MemberLook>
  me?: number | null
  loading?: boolean
  /** The balances could not be loaded: the verdict block explains it, so the rows say nothing more. */
  unavailable?: boolean
  /** "Vì sao ra số này?" for each member: a row opens to its explanation (specs/002-balance-explanation). */
  explanations?: Map<number, Explanation>
  householdId?: number
}

/**
 * "Số dư từng người" (DESIGN.md §6.2): who has paid what, and where each person stands. The sign and the
 * words carry the meaning, the colour only repeats it. Props only.
 */
function BalanceRows({
  balances,
  looks,
  me = null,
  loading = false,
  unavailable = false,
  explanations,
  householdId,
}: BalanceRowsProps) {
  const t = useT()
  // An explanation is only built while its row is open; several rows can be open at once
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  function toggle(memberId: number, isOpen: boolean) {
    setOpen((current) => {
      const next = new Set(current)
      if (isOpen) next.add(memberId)
      else next.delete(memberId)
      return next
    })
  }
  if (loading) {
    return <Skeleton label={t.balances.loading} />
  }
  // Nothing is known, which is not the same as nobody owing anything
  if (unavailable) {
    return <p className="hint">{t.balances.unavailable}</p>
  }

  return (
    <div>
      {balances.length === 0 ? (
        <p className="empty">{t.balances.empty}</p>
      ) : (
        <ul className="balance-list">
          {balances.map((balance) => {
            const look = looks.get(balance.member_id) ?? {
              full: balance.name,
              short: balance.name,
              initial: initialOf(balance.name),
              tint: 1,
            }
            const explanation = explanations?.get(balance.member_id)
            const row: ReactNode = (
              <>
                <Avatar look={look} decorative />
                <span className="who">
                  <strong>
                    {look.short}
                    {me === balance.member_id && <Chip kind="me">{t.common.you}</Chip>}
                  </strong>
                  {balance.paid > 0 && (
                    <small>
                      {t.money.spentInTotal} <Money amount={balance.paid} />
                    </small>
                  )}
                </span>
                <span className="standing">
                  <Money amount={balance.net} kind="balance" />
                  {balance.net > 0 ? (
                    <small>{t.money.getsShort}</small>
                  ) : balance.net < 0 ? (
                    <small>{t.money.owesShort}</small>
                  ) : (
                    tookPart(balance) && <Stamp kind="settled" decorative={false} />
                  )}
                </span>
              </>
            )
            if (!explanation || householdId === undefined) {
              return (
                <li key={balance.member_id} className="balance-row">
                  {row}
                </li>
              )
            }
            return (
              <li key={balance.member_id} className="balance-row openable">
                <details
                  onToggle={(event) => toggle(balance.member_id, event.currentTarget.open)}
                  onKeyDown={closeFoldOnEscape}
                >
                  <summary>{row}</summary>
                  {open.has(balance.member_id) && (
                    <BalanceExplanation explanation={explanation} looks={looks} me={me} householdId={householdId} />
                  )}
                </details>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default BalanceRows
