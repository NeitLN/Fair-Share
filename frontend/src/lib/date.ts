const pad = (n: number) => String(n).padStart(2, '0')

/** Today in the user's time zone as "YYYY-MM-DD" (toISOString would give the UTC date). */
export function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** "2026-10-20" → "20/10/2026", the way dates are written in Vietnam. */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : isoDate
}

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']

/**
 * A day the way people say it (DESIGN.md §7): "Hôm nay, 21/10", "Hôm qua, 20/10", "Thứ bảy, 18/10",
 * and the full "18/10/2025" only for another year.
 */
export function dayLabel(isoDate: string, now = new Date()): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return isoDate
  const dayMonth = `${pad(day)}/${pad(month)}`
  const daysAgo = Math.round(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(year, month - 1, day)) / 86_400_000,
  )
  if (daysAgo === 0) return `Hôm nay, ${dayMonth}`
  if (daysAgo === 1) return `Hôm qua, ${dayMonth}`
  if (year !== now.getFullYear()) return `${dayMonth}/${year}`
  return `${WEEKDAYS[new Date(year, month - 1, day).getDay()]}, ${dayMonth}`
}

/** The earliest day the expense API accepts. */
export const MIN_DAY = '2000-01-01'
/** The latest day the expense API accepts. */
export const MAX_DAY = '2099-12-31'

/**
 * True for a plain "YYYY-MM-DD" day inside 2000-01-01 … 2099-12-31, the range the API accepts.
 * The comparison is safe on the strings because the format sorts the same way as the dates.
 */
export function isDayInRange(isoDate: string): boolean {
  return isoDate !== '' && isoDate >= MIN_DAY && isoDate <= MAX_DAY
}
