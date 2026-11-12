import { Link } from 'react-router'

import type { MyHousehold } from '../api/types'
import { useT } from '../i18n'
import { Money } from './Money'

/**
 * The signed-in user's households (DESIGN.md §6.1, docs/ACCOUNTS.md) as rows in one panel (specs/017,
 * FR-001 to FR-003), each one a link: a small sticker in the house's colour, its name, the ones they
 * own marked, what waits for them, and on the right their balance there, the words quiet and the
 * amount strong, every amount on one edge. Props only; the page loads them, with these figures in the
 * same answer so no row asks for anything more.
 */
function HouseholdList({ households }: { households: MyHousehold[] }) {
  const t = useT()
  if (households.length === 0) {
    return <p className="empty">{t.households.empty}</p>
  }
  return (
    <ul className="house-rows">
      {households.map((household) => (
        <li key={household.id}>
          <Link to={`/households/${household.id}`} className="household-row">
            {/* Decoration: the name says which house it is */}
            <span className={`house-tile tint-${(household.id % 8) + 1}`} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 11l9-7 9 7" />
                <path d="M5 10v10h14V10" />
                <path d="M10 20v-6h4v6" />
              </svg>
            </span>
            <span className="household-head">
              <span className="household-name">{household.name}</span>
              {household.role === 'owner' && <span className="chip chip-zero">{t.households.owner}</span>}
              {household.waiting !== undefined && household.waiting > 0 && (
                <span className="household-waiting" role="status" aria-label={t.households.waiting(household.waiting)}>
                  {household.waiting}
                </span>
              )}
            </span>
            {household.my_net !== undefined && (
              <span className="household-money">
                {household.my_net === 0 ? (
                  // Nobody to settle with yet is not "done" (review 12/11, A13)
                  <span className="household-settled">
                    {household.people === 1 ? t.households.onlyYou : t.households.settled}
                  </span>
                ) : (
                  <>
                    <span className="household-words">
                      {household.my_net > 0 ? t.households.getWords : t.households.oweWords}
                    </span>{' '}
                    <span className={`household-amount ${household.my_net > 0 ? 'credit-text' : 'debt-text'}`}>
                      <Money amount={Math.abs(household.my_net)} />
                    </span>
                  </>
                )}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default HouseholdList
