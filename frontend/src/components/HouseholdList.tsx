import { Link } from 'react-router'

import type { Household } from '../api/types'

interface HouseholdListProps {
  households: Household[]
  loading: boolean
  error: string | null
}

/** Props-only list of households, each row one link (DESIGN.md §6.1). Data fetching stays in the page. */
function HouseholdList({ households, loading, error }: HouseholdListProps) {
  if (loading) {
    return <p className="hint">Đang tải danh sách nhà…</p>
  }
  return (
    <div className="households">
      {error && <p role="alert">{error}</p>}
      {/* An empty list after an error means "could not load", not "no households" */}
      {households.length === 0 ? (
        !error && <p className="empty">Chưa có nhà nào. Tạo nhà đầu tiên rồi thêm bạn cùng phòng.</p>
      ) : (
        <ul className="household-list">
          {households.map((household) => (
            <li key={household.id}>
              <Link to={`/households/${household.id}`} className="household-row">
                {household.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default HouseholdList
