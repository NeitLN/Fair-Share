import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router'

import { ApiError } from '../api/client'
import { getHousehold, keys, listMembers } from '../api/households'
import { AvatarStack } from '../components/Avatar'
import ClaimPanel from '../components/ClaimPanel'
import { IdentityProvider } from '../components/IdentityProvider'
import { keyFromHash } from '../lib/invite'
import { memberLooks } from '../lib/names'
import { useT } from '../i18n'

// Shared frame for one household (DESIGN.md §6.2): its name and people, the tabs. "Bạn" is the
// signed-in user's own name in it (docs/ACCOUNTS.md).
function HouseholdLayout() {
  const householdId = Number(useParams().householdId)
  const location = useLocation()
  const navigate = useNavigate()
  const t = useT()
  const validId = Number.isInteger(householdId) && householdId > 0

  const household = useQuery({
    queryKey: keys.household(householdId),
    queryFn: () => getHousehold(householdId),
    enabled: validId,
  })
  // The same query the pages use, so the cache serves both
  const members = useQuery({
    queryKey: keys.members(householdId),
    queryFn: () => listMembers(householdId),
    enabled: validId && household.isSuccess,
  })
  const looks = useMemo(() => memberLooks(members.data ?? []), [members.data])

  // Not a member: the household does not exist for this account (a stranger, someone waiting for
  // approval, or it was deleted). An invite link from before accounts may still take it over.
  const missing = !validId || (household.error instanceof ApiError && household.error.status === 404)
  const oldKey = keyFromHash(location.hash)

  // In the household now (taken over, or already a member): the old key leaves the address bar, so it
  // is not in a screenshot or a shared tab
  const opened = household.isSuccess
  useEffect(() => {
    if (opened && oldKey) navigate({ pathname: location.pathname, search: location.search }, { replace: true })
  }, [opened, oldKey, navigate, location.pathname, location.search])

  if (missing && validId && oldKey) return <ClaimPanel householdId={householdId} oldKey={oldKey} />
  if (missing) {
    return (
      <>
        <h1>{t.household.notFoundTitle}</h1>
        <p>{t.household.notFound}</p>
        <Link to="/" className="back-link">
          {t.common.backToHouseholds}
        </Link>
      </>
    )
  }

  const people = members.data ?? []
  return (
    <IdentityProvider me={household.data?.member_id ?? null}>
      <div className="house-head">
        <h1>{household.data?.name ?? (household.isPending ? t.common.loading : t.household.fallbackName)}</h1>
        {people.length > 0 && <AvatarStack looks={people.map((m) => looks.get(m.id)!)} />}
      </div>
      {household.error && <p role="alert">{household.error.message}</p>}
      <nav className="tabs" aria-label={t.household.tabs}>
        <NavLink to="" end>
          {t.household.overview}
        </NavLink>
        <NavLink to="expenses">{t.household.expenses}</NavLink>
        <NavLink to="members">{t.household.members}</NavLink>
      </nav>
      <Outlet />
    </IdentityProvider>
  )
}

export default HouseholdLayout
