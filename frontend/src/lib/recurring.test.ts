import { describe, expect, test } from 'vitest'

import type { Expense, Member, RecurringItem } from '../api/types'
import { dueDay, dueItems, keptPeople, monthState } from './recurring'

const item = (id: number, day: number, overrides: Partial<RecurringItem> = {}): RecurringItem => ({
  id,
  household_id: 1,
  description: `Khoản ${id}`,
  category: 'rent',
  payer_id: 2,
  member_ids: [1, 2, 3],
  amount: 4_500_000,
  day,
  created_by: 10,
  created_at: '',
  ...overrides,
})
const linked = (itemId: number, spent_at: string) => ({ id: 99, spent_at, recurring_item_id: itemId }) as Expense

describe('dueDay', () => {
  test('the day, or the last day of a shorter month', () => {
    expect(dueDay(5, '2026-11')).toBe(5)
    expect(dueDay(31, '2026-11')).toBe(30)
    expect(dueDay(31, '2026-12')).toBe(31)
    expect(dueDay(30, '2027-02')).toBe(28)
    expect(dueDay(29, '2028-02')).toBe(29)
  })
})

describe('monthState', () => {
  test('later before its day, due from its day', () => {
    expect(monthState(item(1, 10), [], '2026-11-09')).toBe('later')
    expect(monthState(item(1, 10), [], '2026-11-10')).toBe('due')
    expect(monthState(item(1, 31), [], '2026-11-30')).toBe('due')
  })

  test('recorded by an expense of this month linked to it, not last month or another item', () => {
    expect(monthState(item(1, 1), [linked(1, '2026-11-20')], '2026-11-25')).toBe('recorded')
    expect(monthState(item(1, 1), [linked(1, '2026-10-01')], '2026-11-25')).toBe('due')
    expect(monthState(item(1, 1), [linked(2, '2026-11-01')], '2026-11-25')).toBe('due')
  })
})

describe('dueItems', () => {
  test('due ones only, by day then oldest', () => {
    const items = [item(3, 5), item(1, 20), item(2, 5), item(4, 28)]
    expect(dueItems(items, [linked(1, '2026-11-20')], '2026-11-21').map((i) => i.id)).toEqual([2, 3])
  })
})

describe('keptPeople', () => {
  const members = [
    { id: 1, household_id: 1, name: 'Tiến', created_at: '', role: 'owner' },
    { id: 2, household_id: 1, name: 'Minh', created_at: '', role: null },
    { id: 3, household_id: 1, name: 'Duy Anh', created_at: '', role: 'member' },
  ] as Member[]

  test('people still in the house are kept; a payer who left is left for the user', () => {
    expect(keptPeople(item(1, 1), members)).toEqual({ payerId: null, memberIds: [1, 3], left: [2] })
  })

  test('nobody left out when everyone is still here', () => {
    expect(keptPeople(item(1, 1, { payer_id: 1, member_ids: [1, 3] }), members)).toEqual({
      payerId: 1,
      memberIds: [1, 3],
      left: [],
    })
  })
})
