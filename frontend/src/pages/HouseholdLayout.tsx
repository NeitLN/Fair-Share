import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useParams } from 'react-router'

import { ApiError } from '../api/client'
import { getHousehold, keys, listMembers } from '../api/households'
import { IdentityProvider } from '../components/IdentityProvider'

// Shared frame for one household: its name, then tabs to its dashboard, expenses and members
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

  return (
    <>
      <p className="household-name">
        {household.data?.name ?? (household.isPending ? 'Đang tải…' : '')}
      </p>
      {household.error && <p role="alert">{household.error.message}</p>}
      <nav className="tabs" aria-label="Mục của nhà">
        <NavLink to="" end>
          Tổng quan
        </NavLink>
        <NavLink to="expenses">Chi tiêu</NavLink>
        <NavLink to="members">Thành viên</NavLink>
      </nav>
      <IdentityProvider householdId={householdId} members={members.data}>
        <Outlet />
      </IdentityProvider>
    </>
  )
}

export default HouseholdLayout
