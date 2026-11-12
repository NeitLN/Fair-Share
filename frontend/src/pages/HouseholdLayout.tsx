import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router'

import { ApiError } from '../api/client'
import { getHousehold, keys, listMembers, listMyHouseholds, listRequests } from '../api/households'
import { listNotices, settlementKeys } from '../api/settlements'
import { REFRESH_MS } from '../lib/refresh'
import { AvatarStack } from '../components/Avatar'
import ClaimPanel from '../components/ClaimPanel'
import { IdentityProvider } from '../components/IdentityProvider'
import { closeFoldOnEscape } from '../lib/fold'
import { keyFromHash } from '../lib/invite'
import { memberLooks } from '../lib/names'
import { useMemberPhotos } from '../lib/useMemberPhotos'
import { usePageTitle } from '../lib/usePageTitle'
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
  const photos = useMemberPhotos(householdId, members.data)
  const looks = useMemo(() => memberLooks(members.data ?? [], photos), [members.data, photos])
  // The account's other houses, for Nhà khác (design review 05/11); the same query as Nhà của bạn
  const mine = useQuery({
    queryKey: keys.households,
    queryFn: listMyHouseholds,
    enabled: validId && household.isSuccess,
  })
  const others = (mine.data?.households ?? []).filter((h) => h.id !== householdId)

  // The browser tab says which page of which house this is, so several open tabs can be told apart
  // (review 12/11, D09)
  const section = location.pathname.split('/')[3] ?? ''
  const sectionName =
    section === 'expenses'
      ? t.household.expenses
      : section === 'members'
        ? t.household.members
        : section === 'report'
          ? t.report.open
          : t.household.overview
  usePageTitle(household.data ? `${sectionName} · ${household.data.name}` : sectionName, t.pageTitle)

  // What waits for you, shown on the tabs (UI review 04/11): someone asking the owner to join, and a
  // "Tôi đã chuyển" sent to you. While the page is open they are asked again every 30 s (never in a
  // background tab), so nobody has to reload to see a housemate's step; the pages share these queries
  // and update with them (PROJECT_SPEC §3.3, the in-app refresh the owner approved on 04/11).
  const isOwner = household.data?.role === 'owner'
  const requests = useQuery({
    queryKey: keys.requests(householdId),
    queryFn: () => listRequests(householdId),
    enabled: validId && isOwner,
    refetchInterval: REFRESH_MS,
  })
  const notices = useQuery({
    queryKey: settlementKeys.notices(householdId),
    queryFn: () => listNotices(householdId),
    enabled: validId && household.isSuccess,
    refetchInterval: REFRESH_MS,
  })
  const asking = isOwner ? (requests.data?.length ?? 0) : 0
  const toldMe = (notices.data ?? []).filter(
    (n) => n.status === 'sent' && n.to_member_id === household.data?.member_id,
  ).length

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

  const onReport = /\/report(\/|$)/.test(location.pathname)
  const overviewTab = (
    <>
      {t.household.overview}
      {toldMe > 0 && (
        <span className="tab-badge">
          <span aria-hidden="true">{toldMe}</span>
          <span className="visually-hidden">{t.household.toldYou(toldMe)}</span>
        </span>
      )}
    </>
  )

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
      {/* A phone stacks these; a computer puts the name on the left and the tabs on the right of one row */}
      <div className="house-frame">
        <div className="house-side">
          {/* The way back, and to another house; only the wordmark led out before (design review 05/11) */}
          <nav className="house-crumbs" aria-label={t.household.where}>
            <Link to="/" className="crumb-back">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
              {t.households.title}
            </Link>
            {others.length > 0 && (
              // Keyed by the house, so it is closed again once another house opens
              <details key={householdId} className="house-switch" onKeyDown={closeFoldOnEscape}>
                <summary>{t.household.switchHouse}</summary>
                <ul>
                  {others.map((h) => (
                    <li key={h.id}>
                      <Link to={`/households/${h.id}`}>{h.name}</Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </nav>
          <div className="house-head">
            <h1>{household.data?.name ?? (household.isPending ? t.common.loading : t.household.fallbackName)}</h1>
            {people.length > 0 && <AvatarStack looks={people.map((m) => looks.get(m.id)!)} />}
          </div>
          {household.error && <p role="alert">{household.error.message}</p>}
          <nav className="tabs" aria-label={t.household.tabs}>
            {/* A monthly report belongs to Tổng quan: its tab stays marked there, as the section you are in */}
            {onReport ? (
              <Link to="" aria-current="true">
                {overviewTab}
              </Link>
            ) : (
              <NavLink to="" end>
                {overviewTab}
              </NavLink>
            )}
            <NavLink to="expenses">{t.household.expenses}</NavLink>
            <NavLink to="members">
              {t.household.members}
              {asking > 0 && (
                <span className="tab-badge">
                  <span aria-hidden="true">{asking}</span>
                  <span className="visually-hidden">{t.household.asking(asking)}</span>
                </span>
              )}
            </NavLink>
          </nav>
        </div>
        <div className="house-body">
          <Outlet />
        </div>
      </div>
    </IdentityProvider>
  )
}

export default HouseholdLayout
