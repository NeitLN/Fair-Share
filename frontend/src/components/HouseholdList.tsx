import type { Household } from '../api/types'

interface HouseholdListProps {
  households: Household[]
  loading: boolean
  error: string | null
}

/** Props-only list of households. Data fetching stays in the page (Claude). */
function HouseholdList({ households, loading, error }: HouseholdListProps) {
  if (loading) {
    return <p>Đang tải danh sách nhà…</p>
  }
  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {households.length === 0 ? (
        <p>Chưa có household nào — tạo cái đầu tiên</p>
      ) : (
        <ul>
          {households.map((household) => (
            <li key={household.id}>{household.name}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default HouseholdList
