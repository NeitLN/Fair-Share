import { Link } from 'react-router'

import type { Household } from '../api/types'
import ErrorNote from './ErrorNote'
import Skeleton from './Skeleton'

interface HouseholdListProps {
  households: Household[]
  loading: boolean
  error: string | null
  /** Reloads after a failed load; shows Thử lại next to the error. */
  onRetry?: () => void
  /** The reload is running: Thử lại is disabled. */
  retrying?: boolean
}

/** Props-only list of households, each row one link (DESIGN.md §6.1). Data fetching stays in the page. */
function HouseholdList({
  households,
  loading,
  error,
  onRetry,
  retrying = false,
}: HouseholdListProps) {
  if (loading) {
    return <Skeleton label="Đang tải danh sách nhà" />
  }
  return (
    <div className="households">
      {error && <ErrorNote message={error} onRetry={onRetry} retrying={retrying} />}
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
