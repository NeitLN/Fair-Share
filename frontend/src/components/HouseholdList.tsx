import { Link } from 'react-router'

import type { MyHousehold } from '../api/types'
import { useT } from '../i18n'

/**
 * The signed-in user's households (DESIGN.md §6.1, docs/ACCOUNTS.md), each row one link, the ones they
 * own marked. Props only; the page loads them.
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
            {household.name}
            {household.role === 'owner' && <span className="chip chip-zero">{t.households.owner}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default HouseholdList
