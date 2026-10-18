import { Link } from 'react-router'

import type { Household } from '../api/types'

interface HouseholdListProps {
  households: Household[]
  loading: boolean
  error: string | null
}

/** Props-only list of households. Data fetching stays in the page. */
function HouseholdList({ households, loading, error }: HouseholdListProps) {
  if (loading) {
    return <p>Đang tải danh sách nhà…</p>
  }
  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {/* An empty list after an error means "could not load", not "no households" */}
      {households.length === 0 ? (
        !error && <p>Chưa có nhà nào — tạo nhà đầu tiên ở trên.</p>
      ) : (
        <ul>
          {households.map((household) => (
            <li key={household.id}>
              <Link to={`/households/${household.id}`}>{household.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default HouseholdList
