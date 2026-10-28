import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router'

import { ApiError } from '../api/client'
import { getHousehold, keys, listMembers } from '../api/households'
import { AvatarStack } from '../components/Avatar'
import { IdentityProvider } from '../components/IdentityProvider'
import WhoAmI from '../components/WhoAmI'
import {
  forget,
  keyFor,
  keyFromHash,
  keyWorks,
  remember,
  restoreReplacedKey,
  savedOnThisDevice,
  wasRefused,
} from '../lib/knownHouseholds'
import { memberLooks } from '../lib/names'
import { useToast } from '../lib/toast'

// Shared frame for one household (DESIGN.md §6.2): its name and people, the tabs, "Bạn là ai?"
function HouseholdLayout() {
  const householdId = Number(useParams().householdId)
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const validId = Number.isInteger(householdId) && householdId > 0

  // An invite link (/households/12#k=…): keep its key before any page below asks the API with it.
  // Writing the same key again is harmless, so doing it while rendering is safe. A key this browser
  // already held is kept aside until the API says whether the new one works (below).
  const invited = keyFromHash(location.hash)
  if (validId && invited && keyFor(householdId) !== invited && !wasRefused(householdId, invited)) {
    remember(householdId, invited)
  }
  const hasKey = validId && keyFor(householdId) !== null
  // ...then take it out of the address bar, so it is not in a screenshot or a shared tab. Unless this
  // browser could not store it: then the link is the only way back after a reload, so it stays.
  const stored = savedOnThisDevice()
  useEffect(() => {
    if (!invited || !stored) return
    navigate({ pathname: location.pathname, search: location.search }, { replace: true })
  }, [invited, stored, navigate, location.pathname, location.search])

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
  // Deleted: it leaves the list. A wrong invite link for a household this browser could already
  // open: back to the key that worked, and ask again with it.
  const opened = household.isSuccess && !household.isFetching
  useEffect(() => {
    if (opened) {
      remember(householdId)
      keyWorks(householdId)
    } else if (missing && validId) {
      if (restoreReplacedKey(householdId)) {
        toast({ text: 'Đường dẫn mời này không đúng, nên máy vẫn dùng khoá cũ của nhà.' })
        void queryClient.resetQueries({ queryKey: keys.household(householdId) })
      } else {
        forget(householdId)
      }
    }
  }, [opened, missing, householdId, validId, toast, queryClient])

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
      {!stored && (
        <p className="note attention">
          Trình duyệt này không lưu được khoá của nhà (có thể đang ở chế độ ẩn danh). Trước khi đóng
          trang, vào <b>Thành viên</b> và bấm <b>Sao chép đường dẫn mời</b> để mở lại nhà sau này.
        </p>
      )}
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
