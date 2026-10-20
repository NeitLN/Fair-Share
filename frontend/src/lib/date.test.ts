import { afterEach, expect, test, vi } from 'vitest'

import { formatDate, today } from './date'

afterEach(() => {
  vi.useRealTimers()
})

test('today is the local date, even just after midnight in Vietnam (still yesterday in UTC)', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 21, 0, 30)) // 21/10 00:30 local time
  expect(today()).toBe('2026-10-21')
})

test.each([
  ['2026-10-20', '20/10/2026'],
  ['2026-01-05T08:00:00Z', '05/01/2026'],
  ['not a date', 'not a date'],
])('formatDate(%s) is %s', (iso, shown) => {
  expect(formatDate(iso)).toBe(shown)
})
