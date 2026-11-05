import { describe, expect, test } from 'vitest'

import type { Expense, Member, MemberBalance, Settlement } from '../api/types'
import { clampMonth, inStep, monthRange, monthReport, shiftMonth } from './monthReport'
import type { MonthReport } from './monthReport'

// The seed's Nhà trọ Bình Thạnh: Tiến 1, Minh 2, Duy Anh 3; the same figures as explain.test.ts
const expense = (id: number, spent_at: string, amount: number, payer_id: number, shares: [number, number][]) =>
  ({
    id,
    household_id: 1,
    description: `Khoản ${id}`,
    amount,
    payer_id,
    spent_at,
    shares: shares.map(([member_id, part]) => ({ member_id, amount: part })),
  }) as Expense
const settlement = (id: number, settled_at: string, from: number, to: number, amount: number) =>
  ({ id, household_id: 1, from_member_id: from, to_member_id: to, amount, settled_at, note: null }) as Settlement
const member = (id: number, name: string) => ({ id, household_id: 1, name, created_at: '' }) as Member

const members = [member(1, 'Tiến'), member(2, 'Minh'), member(3, 'Duy Anh')]
const expenses = [
  expense(1, '2026-10-01', 4_500_000, 2, [[1, 1_500_000], [2, 1_500_000], [3, 1_500_000]]),
  expense(2, '2026-10-12', 360_000, 3, [[1, 120_000], [2, 120_000], [3, 120_000]]),
  expense(3, '2026-11-03', 450_000, 1, [[1, 150_000], [2, 150_000], [3, 150_000]]),
  expense(4, '2026-11-04', 240_000, 2, [[1, 80_000], [2, 80_000], [3, 80_000]]),
  // A custom split that leaves Minh out, with a 0 đồng share written for him
  expense(5, '2026-11-04', 100_000, 3, [[1, 40_000], [2, 0], [3, 60_000]]),
]
const settlements = [settlement(9, '2026-10-15', 1, 2, 1_000_000)]
const NOW = '2026-11'

const figures = (report: MonthReport) =>
  report.lines.map((l) => [l.memberId, l.start, l.paid, l.share, l.paidBack, l.gotBack, l.end])
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

/** Invariants 1–4 and 8 of data-model.md, for any report. */
function expectBalanced(report: MonthReport) {
  for (const l of report.lines) {
    for (const value of [l.start, l.paid, l.share, l.paidBack, l.gotBack, l.end]) {
      expect(Number.isInteger(value)).toBe(true)
    }
    expect(l.start + l.paid - l.share + l.paidBack - l.gotBack).toBe(l.end)
  }
  expect(sum(report.lines.map((l) => l.start))).toBe(0)
  expect(sum(report.lines.map((l) => l.end))).toBe(0)
  expect(sum(report.lines.map((l) => l.paid))).toBe(report.total)
  expect(sum(report.lines.map((l) => l.share))).toBe(report.total)
  expect(sum(report.lines.map((l) => l.paidBack))).toBe(sum(report.lines.map((l) => l.gotBack)))
  if (report.empty) {
    for (const l of report.lines) {
      expect([l.paid, l.share, l.paidBack, l.gotBack]).toEqual([0, 0, 0, 0])
      expect(l.start).toBe(l.end)
    }
  }
}

describe('monthReport', () => {
  test('the first month starts everyone at 0 and counts its expenses and repayment', () => {
    const october = monthReport('2026-10', expenses, settlements, members, NOW)
    expect(october.total).toBe(4_860_000)
    expect(october.empty).toBe(false)
    expect(figures(october)).toEqual([
      [1, 0, 0, 1_620_000, 1_000_000, 0, -620_000],
      [2, 0, 4_500_000, 1_620_000, 0, 1_000_000, 1_880_000],
      [3, 0, 360_000, 1_620_000, 0, 0, -1_260_000],
    ])
    expectBalanced(october)
  })

  test('the next month starts where the last one ended and ends on the balances (explain.test.ts)', () => {
    const november = monthReport('2026-11', expenses, settlements, members, NOW)
    expect(november.total).toBe(790_000)
    expect(figures(november)).toEqual([
      [1, -620_000, 450_000, 270_000, 0, 0, -440_000],
      [2, 1_880_000, 240_000, 230_000, 0, 0, 1_890_000],
      [3, -1_260_000, 100_000, 290_000, 0, 0, -1_450_000],
    ])
    expectBalanced(november)
  })

  test("each month's end is the next month's start, all the way through", () => {
    const range = monthRange(expenses, settlements, '2027-02')
    let month = range.first
    let previous = monthReport(month, expenses, settlements, members, '2027-02')
    expect(previous.lines.every((l) => l.start === 0)).toBe(true)
    while (month !== range.last) {
      month = shiftMonth(month, 1)
      const report = monthReport(month, expenses, settlements, members, '2027-02')
      expectBalanced(report)
      expect(report.lines.map((l) => l.start)).toEqual(previous.lines.map((l) => l.end))
      previous = report
    }
  })

  test('a month with nothing in it says so and leaves every balance as it was', () => {
    const december = monthReport('2026-12', expenses, settlements, members, '2026-12')
    expect(december.empty).toBe(true)
    expect(december.total).toBe(0)
    expect(december.lines.map((l) => [l.start, l.end])).toEqual([
      [-440_000, -440_000],
      [1_890_000, 1_890_000],
      [-1_450_000, -1_450_000],
    ])
    expectBalanced(december)
  })

  test('a repayment alone makes the month not empty', () => {
    const later = [...settlements, settlement(10, '2026-12-01', 3, 2, 500_000)]
    const december = monthReport('2026-12', expenses, later, members, '2026-12')
    expect(december.empty).toBe(false)
    expect(figures(december)[1]).toEqual([2, 1_890_000, 0, 0, 0, 500_000, 1_390_000])
    expect(figures(december)[2]).toEqual([3, -1_450_000, 0, 0, 500_000, 0, -950_000])
    expectBalanced(december)
  })

  test('something dated after the current month is flagged on the current month only', () => {
    const withLater = [...expenses, expense(7, '2026-12-02', 300_000, 1, [[1, 100_000], [2, 100_000], [3, 100_000]])]
    expect(monthReport('2026-11', withLater, settlements, members, NOW).laterItems).toBe(true)
    expect(monthReport('2026-10', withLater, settlements, members, NOW).laterItems).toBe(false)
    expect(monthReport('2026-12', withLater, settlements, members, NOW).laterItems).toBe(false)
    expect(monthReport('2026-11', expenses, settlements, members, NOW).laterItems).toBe(false)
  })

  test('someone who left keeps a line after the members of today, so the sums still hold', () => {
    const withGone = [...expenses, expense(6, '2026-09-20', 100_000, 7, [[7, 50_000], [1, 50_000]])]
    const september = monthReport('2026-09', withGone, settlements, members, NOW)
    expect(september.lines.map((l) => l.memberId)).toEqual([1, 2, 3, 7])
    expect(figures(september)[3]).toEqual([7, 0, 100_000, 50_000, 0, 0, 50_000])
    expectBalanced(september)
    // Still there in a month they took no part in, with their balance carried
    const november = monthReport('2026-11', withGone, settlements, members, NOW)
    expect(figures(november)[3]).toEqual([7, 50_000, 0, 0, 0, 0, 50_000])
    expectBalanced(november)
  })

  test('a house with nothing yet has zero lines for its members', () => {
    const empty = monthReport(NOW, [], [], members, NOW)
    expect(empty.empty).toBe(true)
    expect(figures(empty)).toEqual([
      [1, 0, 0, 0, 0, 0, 0],
      [2, 0, 0, 0, 0, 0, 0],
      [3, 0, 0, 0, 0, 0, 0],
    ])
  })
})

describe('monthRange', () => {
  test('runs from the first item to the current month', () => {
    expect(monthRange(expenses, settlements, NOW)).toEqual({ first: '2026-10', last: '2026-11' })
  })

  test('a repayment can be the first item', () => {
    expect(monthRange(expenses, [settlement(1, '2026-08-30', 1, 2, 1)], NOW).first).toBe('2026-08')
  })

  test('runs past the current month to the last dated item', () => {
    const later = [...expenses, expense(7, '2027-01-02', 3, 1, [[1, 3]])]
    expect(monthRange(later, settlements, NOW)).toEqual({ first: '2026-10', last: '2027-01' })
  })

  test('is just the current month when there is nothing', () => {
    expect(monthRange([], [], NOW)).toEqual({ first: NOW, last: NOW })
  })

  test('starts at the current month when everything is later', () => {
    expect(monthRange([expense(7, '2026-12-02', 3, 1, [[1, 3]])], [], NOW)).toEqual({ first: NOW, last: '2026-12' })
  })
})

describe('clampMonth', () => {
  const range = { first: '2026-10', last: '2026-12' }
  test('no month is the current one', () => expect(clampMonth(undefined, range, NOW)).toBe(NOW))
  test('a month in range is kept', () => expect(clampMonth('2026-10', range, NOW)).toBe('2026-10'))
  test('before the first goes to the first', () => expect(clampMonth('1999-01', range, NOW)).toBe('2026-10'))
  test('after the last goes to the last', () => expect(clampMonth('2030-05', range, NOW)).toBe('2026-12'))
  test.each(['2026-13', '2026-00', 'abc', '2026-1', ''])('"%s" is not a month and goes to the last', (bad) =>
    expect(clampMonth(bad, range, NOW)).toBe('2026-12'),
  )
})

describe('shiftMonth', () => {
  test('crosses a year both ways', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
    expect(shiftMonth('2026-10', 1)).toBe('2026-11')
  })
})

describe('inStep', () => {
  const balance = (member_id: number, net: number) => ({ member_id, net }) as MemberBalance
  const november = monthReport('2026-11', expenses, settlements, members, NOW)

  test('true when every end equals the balance', () => {
    expect(inStep(november, [balance(1, -440_000), balance(2, 1_890_000), balance(3, -1_450_000)])).toBe(true)
  })

  test('false on a difference of 1 đồng', () => {
    expect(inStep(november, [balance(1, -440_001), balance(2, 1_890_001), balance(3, -1_450_000)])).toBe(false)
  })

  test('a member missing from the balances counts as 0', () => {
    const empty = monthReport(NOW, [], [], members, NOW)
    expect(inStep(empty, [])).toBe(true)
    expect(inStep(november, [balance(1, -440_000), balance(2, 1_890_000)])).toBe(false)
  })

  test('a balance for someone without a line must be 0', () => {
    const empty = monthReport(NOW, [], [], members, NOW)
    expect(inStep(empty, [balance(9, 5)])).toBe(false)
  })
})
