import { NavLink, Outlet } from 'react-router'

// Shared frame for one household: tabs to its dashboard, expenses and members
function HouseholdLayout() {
  return (
    <>
      <nav className="tabs" aria-label="Mục của nhà">
        <NavLink to="" end>
          Tổng quan
        </NavLink>
        <NavLink to="expenses">Chi tiêu</NavLink>
        <NavLink to="members">Thành viên</NavLink>
      </nav>
      <Outlet />
    </>
  )
}

export default HouseholdLayout
