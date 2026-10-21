import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router'

import { ApiError } from '../api/client'
import { getHousehold, keys, listMembers } from '../api/households'
import { AvatarStack } from '../components/Avatar'
import { IdentityProvider } from '../components/IdentityProvider'
import WhoAmI from '../components/WhoAmI'
import { memberLooks } from '../lib/names'

// Shared frame for one household (DESIGN.md §6.2): its name and people, the tabs, "Bạn là ai?"
function HouseholdLayout() {
  const householdId = Number(useParams().householdId)
  const household = useQuery({
    queryKey: keys.household(householdId),
    queryFn: () => getHousehold(householdId),
    enabled: Number.isInteger(householdId),
  })
  // The same query the pages use, so the cache serves both; it also lets "Bạn là ai?" check its choice
  const members = useQuery({
    queryKey: keys.members(householdId),
    queryFn: () => listMembers(householdId),
    enabled: Number.isInteger(householdId),
  })
  const looks = useMemo(() => memberLooks(members.data ?? []), [members.data])

  const missing =
    !Number.isInteger(householdId) ||
    (household.error instanceof ApiError && household.error.status === 404)
  if (missing) {
    return (
      <>
        <h1>Không tìm thấy nhà này</h1>
        <p>
          Có thể nhà đã bị xoá. <Link to="/">Về danh sách các nhà</Link>
        </p>
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
