import { Link } from 'react-router'

import ErrorNote from './ErrorNote'
import Skeleton from './Skeleton'

/** One household this browser knows, as far as it has been loaded. */
export interface KnownHousehold {
  id: number
  /** Known once it has loaded. */
  name?: string
  loading?: boolean
  /** Loading it failed (not "it was deleted": those leave the list). */
  error?: string | null
}

interface HouseholdListProps {
  households: KnownHousehold[]
  /** Loads one household again after a failure. */
  onRetry: (id: number) => void
  /** Takes a household off this browser's list (its data stays). */
  onForget: (household: KnownHousehold) => void
}

/**
 * The households this browser created or opened (DESIGN.md §6.1, #132), each row one link, with a way
 * to take it off the list. Props only; the page loads them.
 */
function HouseholdList({ households, onRetry, onForget }: HouseholdListProps) {
  if (households.length === 0) {
    return (
      <p className="empty">
        Máy này chưa có nhà nào. Tạo nhà đầu tiên, hoặc mở đường dẫn mời mà bạn cùng phòng gửi.
      </p>
    )
  }
  return (
    <ul className="household-list">
      {households.map((household) => {
        const label = household.name ?? `Nhà #${household.id}`
        return (
          <li key={household.id}>
            {household.loading ? (
              <Skeleton label="Đang tải nhà" rows={1} />
            ) : household.error ? (
              <ErrorNote message={household.error} onRetry={() => onRetry(household.id)} />
            ) : (
              <Link to={`/households/${household.id}`} className="household-row">
                {label}
              </Link>
            )}
            <button
              type="button"
              className="btn-ghost forget"
              aria-label={`Bỏ ${label} khỏi danh sách`}
              onClick={() => onForget(household)}
            >
              Bỏ khỏi danh sách
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default HouseholdList
