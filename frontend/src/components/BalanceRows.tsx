import type { MemberBalance } from '../api/types'
import { initialOf } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { tookPart } from '../lib/verdict'
import { Avatar } from './Avatar'
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
}

/**
 * "Số dư từng người" (DESIGN.md §6.2): who has paid what, and where each person stands. The sign and the
 * words carry the meaning, the colour only repeats it. Props only.
 */
function BalanceRows({ balances, looks, me = null, loading = false, unavailable = false }: BalanceRowsProps) {
  const t = useT()
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
            return (
              <li key={balance.member_id} className="balance-row">
                <Avatar look={look} decorative />
                <span className="who">
                  <strong>
                    {look.short}
                    {me === balance.member_id && <Chip kind="me">{t.common.you}</Chip>}
                  </strong>
                  {balance.paid > 0 && (
                    <small>
                      {t.money.spent} <Money amount={balance.paid} />
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
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default BalanceRows
