interface SkeletonProps {
  /** How many placeholder rows to draw. */
  rows?: number
  /** What is loading, read by screen readers, e.g. "Đang tải danh sách khoản chi". */
  label: string
}

/** Grey placeholder rows shown while a list or a page loads (DESIGN.md §6.5). */
function Skeleton({ rows = 3, label }: SkeletonProps) {
  return (
    <div role="status" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton-row" aria-hidden="true" />
      ))}
    </div>
  )
}

export default Skeleton
