import { Link } from 'react-router'

import type { MyHousehold } from '../api/types'
import { useT } from '../i18n'
import { Money } from './Money'

/**
 * The signed-in user's households (DESIGN.md §6.1, docs/ACCOUNTS.md), each one a link: its name,
 * the ones they own marked, their balance there and what waits for them. Props only; the page
 * loads them, with these figures in the same answer so no card asks for anything more.
 */
function HouseholdList({ households }: { households: MyHousehold[] }) {
  const t = useT()
  if (households.length === 0) {
    return <p className="empty">{t.households.empty}</p>
  }
  return (
    <ul className="household-list">
      {households.map((household) => (
        <li key={household.id}>
          <Link to={`/households/${household.id}`} className="household-row">
            <span className="household-head">
              <span className="household-name">{household.name}</span>
              {household.role === 'owner' && <span className="chip chip-zero">{t.households.owner}</span>}
            </span>
            {household.my_net !== undefined && (
              <span
                className={`household-balance${
                  household.my_net > 0 ? ' credit-text' : household.my_net < 0 ? ' debt-text' : ''
                }`}
              >
                {household.my_net > 0
                  ? t.households.youGet(<Money amount={household.my_net} />)
                  : household.my_net < 0
                    ? t.households.youOwe(<Money amount={-household.my_net} />)
                    : t.households.settled}
              </span>
            )}
            {household.waiting !== undefined && household.waiting > 0 && (
              <span className="household-waiting" role="status" aria-label={t.households.waiting(household.waiting)}>
                {household.waiting}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default HouseholdList
