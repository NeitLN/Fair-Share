import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router'

import { ApiError } from '../api/client'
import { getHousehold, keys, listMembers } from '../api/households'
import { AvatarStack } from '../components/Avatar'
import { IdentityProvider } from '../components/IdentityProvider'
import WhoAmI from '../components/WhoAmI'
import { forget, keyFor, keyFromHash, remember } from '../lib/knownHouseholds'
import { memberLooks } from '../lib/names'

// Shared frame for one household (DESIGN.md §6.2): its name and people, the tabs, "Bạn là ai?"
function HouseholdLayout() {
  const householdId = Number(useParams().householdId)
  const location = useLocation()
  const navigate = useNavigate()
  const validId = Number.isInteger(householdId) && householdId > 0

  // An invite link (/households/12#k=…): keep its key before any page below asks the API with it.
  // Writing the same key again is harmless, so doing it while rendering is safe.
  const invited = keyFromHash(location.hash)
  if (validId && invited && keyFor(householdId) !== invited) remember(householdId, invited)
  const hasKey = validId && keyFor(householdId) !== null
  // ...then take it out of the address bar, so it is not in a screenshot or a shared tab
  useEffect(() => {
    if (invited) navigate({ pathname: location.pathname, search: location.search }, { replace: true })
  }, [invited, navigate, location.pathname, location.search])

  const household = useQuery({
    queryKey: keys.household(householdId),
    queryFn: () => getHousehold(householdId),
    enabled: hasKey,
  })
  // The same query the pages use, so the cache serves both; it also lets "Bạn là ai?" check its choice
  const members = useQuery({
    queryKey: keys.members(householdId),
    queryFn: () => listMembers(householdId),
    enabled: hasKey,
  })
  const looks = useMemo(() => memberLooks(members.data ?? []), [members.data])

  // With a key that no longer opens it: deleted, or a wrong link (the API cannot tell them apart)
  const missing =
    !validId || (household.error instanceof ApiError && household.error.status === 404)

  // Opened here (or from a link a housemate sent): this browser's home page lists it from now on.
  // Deleted: it leaves the list.
  const opened = household.isSuccess
  useEffect(() => {
    if (opened) remember(householdId)
    else if (missing && validId) forget(householdId)
  }, [opened, missing, householdId, validId])

  if (validId && !hasKey) {
    return (
      <>
        <h1>Cần đường dẫn mời</h1>
        <p className="empty">
          Nhà này chỉ mở được bằng đường dẫn mời. Nhờ một người trong nhà vào <b>Thành viên</b>, bấm{' '}
          <b>Sao chép đường dẫn mời</b> rồi gửi cho bạn.
        </p>
        <Link to="/" className="back-link">
          Về danh sách các nhà
        </Link>
      </>
    )
  }
  if (missing) {
    return (
      <>
        <h1>Không tìm thấy nhà này</h1>
        <p>Có thể nhà đã bị xoá, hoặc đường dẫn mời không đúng.</p>
        <Link to="/" className="back-link">
          Về danh sách các nhà
        </Link>
      </>
    )
  }

  const people = members.data ?? []
  return (
    <IdentityProvider householdId={householdId} members={members.data}>
      <div className="house-head">
        <h1>{household.data?.name ?? (household.isPending ? 'Đang tải…' : 'Nhà')}</h1>
        {people.length > 0 && <AvatarStack looks={people.map((m) => looks.get(m.id)!)} />}
      </div>
      {household.error && <p role="alert">{household.error.message}</p>}
      <nav className="tabs" aria-label="Mục của nhà">
        <NavLink to="" end>
          Tổng quan
        </NavLink>
        <NavLink to="expenses">Chi tiêu</NavLink>
        <NavLink to="members">Thành viên</NavLink>
      </nav>
      {people.length > 0 && <WhoAmI members={people} looks={looks} />}
      <Outlet />
    </IdentityProvider>
  )
}

export default HouseholdLayout
