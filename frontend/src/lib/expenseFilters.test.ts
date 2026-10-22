import { describe, expect, test } from 'vitest'

import type { Expense, Member } from '../api/types'
import {
  filterExpenses,
  involves,
  isFiltered,
  monthLabel,
  monthsOf,
  monthTotals,
  NO_FILTER,
} from './expenseFilters'

const member = (id: number, name: string): Member => ({ id, household_id: 7, name, created_at: '' })
const members = [member(1, 'Tiến'), member(2, 'Minh'), member(3, 'Anh')]

let nextId = 1
function expense(spent_at: string, amount: number, payer_id: number, shares: [number, number][]): Expense {
  return {
    id: nextId++,
    household_id: 7,
    description: `Khoản ${nextId}`,
    amount,
    payer_id,
    spent_at,
    source: 'manual',
    created_at: '',
    split_type: 'custom',
    shares: shares.map(([member_id, part]) => ({ member_id, amount: part })),
  }
}

const hotpot = expense('2026-10-22', 300_000, 1, [[1, 100_000], [2, 100_000], [3, 100_000]])
const water = expense('2026-10-03', 100_000, 2, [[1, 33_334], [2, 33_333], [3, 33_333]])
const rent = expense('2026-09-30', 3_000_000, 3, [[2, 1_500_000], [3, 1_500_000]])
const all = [hotpot, water, rent]

describe('months', () => {
  test('every month with an expense, newest first, each once', () => {
    expect(monthsOf(all)).toEqual(['2026-10', '2026-09'])
    expect(monthsOf([])).toEqual([])
  })

  test('a month reads the Vietnamese way', () => {
    expect(monthLabel('2026-10')).toBe('Tháng 10/2026')
    expect(monthLabel('2027-01')).toBe('Tháng 1/2027')
  })
})

describe('filterExpenses', () => {
  test('no filter keeps everything, in the same order', () => {
    expect(filterExpenses(all, NO_FILTER)).toEqual(all)
    expect(isFiltered(NO_FILTER)).toBe(false)
  })

  test('by month', () => {
    expect(filterExpenses(all, { month: '2026-10', memberId: null })).toEqual([hotpot, water])
    expect(filterExpenses(all, { month: '2026-08', memberId: null })).toEqual([])
  })

  test('a member matches what they paid or share in', () => {
    // Tiến paid the hotpot and shares the water, but has nothing to do with the rent
    expect(involves(rent, 1)).toBe(false)
    expect(filterExpenses(all, { month: null, memberId: 1 })).toEqual([hotpot, water])
    // Paying without a share of it still counts
    const gift = expense('2026-10-10', 50_000, 3, [[1, 50_000]])
    expect(filterExpenses([gift], { month: null, memberId: 3 })).toEqual([gift])
  })

  test('month and member together', () => {
    const filter = { month: '2026-09', memberId: 2 }
    expect(filterExpenses(all, filter)).toEqual([rent])
    expect(isFiltered(filter)).toBe(true)
  })
})

describe('monthTotals', () => {
  test('what each member paid and owes for the month, in whole đồng', () => {
    const october = filterExpenses(all, { month: '2026-10', memberId: null })
    expect(monthTotals(october, members)).toEqual({
      total: 400_000,
      members: [
        { memberId: 1, paid: 300_000, share: 133_334 },
        { memberId: 2, paid: 100_000, share: 133_333 },
        { memberId: 3, paid: 0, share: 133_333 },
      ],
    })
  })

  test('the shares and the payments both add up to the total', () => {
    const { total, members: rows } = monthTotals(all, members)
    expect(rows.reduce((sum, r) => sum + r.share, 0)).toBe(total)
    expect(rows.reduce((sum, r) => sum + r.paid, 0)).toBe(total)
  })

  test('every member has a row, even with nothing that month', () => {
    expect(monthTotals([], members)).toEqual({
      total: 0,
      members: [1, 2, 3].map((memberId) => ({ memberId, paid: 0, share: 0 })),
    })
  })

  test('someone no longer in the household still gets a row, after today\'s members', () => {
    const old = expense('2026-10-01', 90_000, 9, [[9, 45_000], [1, 45_000]])
    const { members: rows } = monthTotals([old], members)
    expect(rows.map((r) => r.memberId)).toEqual([1, 2, 3, 9])
    expect(rows[3]).toEqual({ memberId: 9, paid: 90_000, share: 45_000 })
  })
})
