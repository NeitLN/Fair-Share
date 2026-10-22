import { afterEach, expect, test, vi } from 'vitest'

import { dayLabel, formatDate, isDayInRange, today } from './date'

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

test.each([
  ['2026-10-21', 'Hôm nay, 21/10'],
  ['2026-10-20', 'Hôm qua, 20/10'],
  ['2026-10-18', 'Chủ nhật, 18/10'],
  ['2026-10-17', 'Thứ bảy, 17/10'],
  ['2026-10-22', 'Thứ năm, 22/10'],
  ['2026-01-01', 'Thứ năm, 01/01'],
  ['2025-12-31', '31/12/2025'],
  ['not a date', 'not a date'],
])('dayLabel(%s) on Wed 21/10/2026 is %s', (iso, shown) => {
  expect(dayLabel(iso, new Date(2026, 9, 21, 23, 50))).toBe(shown)
})

test('across New Year, "today" and "yesterday" win over the year', () => {
  const newYear = new Date(2027, 0, 1, 8)
  expect(dayLabel('2027-01-01', newYear)).toBe('Hôm nay, 01/01')
  expect(dayLabel('2026-12-31', newYear)).toBe('Hôm qua, 31/12')
  expect(dayLabel('2026-12-30', newYear)).toBe('30/12/2026')
})

test.each([
  ['2000-01-01', true],
  ['2099-12-31', true],
  ['2026-10-21', true],
  ['1999-12-31', false],
  ['2100-01-01', false],
  ['', false],
])('isDayInRange(%s) is %s', (iso, inside) => {
  expect(isDayInRange(iso)).toBe(inside)
})
