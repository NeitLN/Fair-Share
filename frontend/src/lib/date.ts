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
