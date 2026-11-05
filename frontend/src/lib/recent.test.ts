import { afterEach, describe, expect, test, vi } from 'vitest'

import type { Expense, Member, Settlement } from '../api/types'
import { marksAfter, readMarks, recentItems, savedKey, writeMarks } from './recent'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

// Accounts 9 (me: Tiến, member 1), 10 (Minh, member 2), 11 (Duy Anh, member 3); account 12 left the house
const ME = 9
const members = [
  { id: 1, household_id: 7, name: 'Tiến', created_at: '', user_id: 9 },
  { id: 2, household_id: 7, name: 'Minh', created_at: '', user_id: 10 },
  { id: 3, household_id: 7, name: 'Duy Anh', created_at: '', user_id: 11 },
] as Member[]
const NOW = new Date('2026-11-06T12:00:00Z')

const expense = (id: number, created_at: string, created_by: number | null, payer_id = 2) =>
  ({ id, household_id: 7, description: `Khoản ${id}`, amount: id * 1000, payer_id, spent_at: '2026-11-01',
    created_at, created_by, shares: [] }) as unknown as Expense
const repayment = (id: number, created_at: string, created_by: number | null, from = 1, to = 2) =>
  ({ id, household_id: 7, from_member_id: from, to_member_id: to, amount: id * 1000, settled_at: '2026-11-01',
    note: null, created_at, created_by }) as Settlement

describe('savedKey', () => {
  test('pads the fraction to microseconds and drops the zone', () => {
    expect(savedKey('2026-11-05T19:33:16.279230Z')).toBe('2026-11-05T19:33:16.279230')
    expect(savedKey('2026-11-05T19:33:16.2Z')).toBe('2026-11-05T19:33:16.200000')
    // No fraction at all: the server leaves it out when it is zero
    expect(savedKey('2026-11-05T19:33:16Z')).toBe('2026-11-05T19:33:16.000000')
    expect(savedKey('2026-11-05T19:33:16+00:00')).toBe('2026-11-05T19:33:16.000000')
  })

  test('keys sort like the instants, where the raw strings would not', () => {
    const whole = '2026-11-05T19:33:16Z'
    const later = '2026-11-05T19:33:16.000001Z'
    expect(later < whole).toBe(true) // "." sorts before "Z": the bug the key avoids
    expect(savedKey(later) > savedKey(whole)).toBe(true)
  })

  test('another zone is turned into UTC, keeping the microseconds', () => {
    expect(savedKey('2026-11-06T02:33:16.000123+07:00')).toBe('2026-11-05T19:33:16.000123')
  })
})

describe('recentItems', () => {
  const noMarks = null

  test("other accounts' records only: not mine, not those from before accounts", () => {
    const items = recentItems(
      [expense(1, '2026-11-06T08:00:00Z', 10), expense(2, '2026-11-06T08:01:00Z', ME), expense(3, '2026-11-06T08:02:00Z', null)],
      [repayment(4, '2026-11-06T08:03:00Z', ME, 2, 1)],
      members, ME, noMarks, NOW,
    )
    expect(items.map((i) => [i.kind, i.id])).toEqual([['expense', 1]])
  })

  test('who recorded it matters, not who paid: ghi hộ is news, and so is the receiver recording my repayment', () => {
    const items = recentItems(
      // Minh recorded an expense I (member 1) paid
      [expense(5, '2026-11-06T09:00:00Z', 10, 1)],
      // Minh recorded receiving my repayment
      [repayment(6, '2026-11-06T09:30:00Z', 10, 1, 2)],
      members, ME, noMarks, NOW,
    )
    expect(items).toEqual([
      expect.objectContaining({ kind: 'repayment', id: 6, recorderMemberId: 2, fromMemberId: 1, amount: 6000 }),
      expect.objectContaining({ kind: 'expense', id: 5, recorderMemberId: 2, description: 'Khoản 5', amount: 5000 }),
    ])
  })

  test('a recorder whose account left the house is kept, without a member', () => {
    const [item] = recentItems([expense(7, '2026-11-06T09:00:00Z', 12)], [], members, ME, noMarks, NOW)
    expect(item.recorderMemberId).toBeNull()
  })

  test('both lists merged, newest saved first, whatever the spent or repaid date', () => {
    const items = recentItems(
      [expense(1, '2026-11-06T08:00:00.000002Z', 10), expense(2, '2026-11-06T10:00:00Z', 11)],
      [repayment(3, '2026-11-06T08:00:00.000001Z', 10), repayment(4, '2026-11-06T09:00:00Z', 11)],
      members, ME, noMarks, NOW,
    )
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(['expense:2', 'repayment:4', 'expense:1', 'repayment:3'])
  })

  test('without marks, the last 7 days by the clock', () => {
    const items = recentItems(
      [expense(1, '2026-10-30T11:59:00Z', 10), expense(2, '2026-10-30T12:01:00Z', 10)],
      [],
      members, ME, noMarks, NOW,
    )
    expect(items.map((i) => i.id)).toEqual([2])
  })

  test('with marks, strictly after the mark of its own list; a null mark takes the whole list', () => {
    const marks = { expenses: savedKey('2026-11-06T08:00:00Z'), settlements: null }
    const items = recentItems(
      [expense(1, '2026-11-06T08:00:00Z', 10), expense(2, '2026-11-06T08:00:00.000001Z', 10), expense(3, '2026-10-01T00:00:00Z', 10)],
      // Older than the expenses' mark and than 7 days, but the repayments' mark is null
      [repayment(4, '2026-10-01T00:00:00Z', 10)],
      members, ME, marks, NOW,
    )
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(['expense:2', 'repayment:4'])
  })
})

describe('marksAfter', () => {
  test('the latest saved time of each list, own records included', () => {
    const marks = marksAfter(
      [expense(1, '2026-11-06T08:00:00Z', 10), expense(2, '2026-11-06T09:00:00.5Z', ME)],
      [repayment(3, '2026-11-06T07:00:00Z', 11)],
      null,
    )
    expect(marks).toEqual({ expenses: '2026-11-06T09:00:00.500000', settlements: '2026-11-06T07:00:00.000000' })
  })

  test('never moves back, and an empty list keeps its mark', () => {
    const previous = { expenses: '2026-11-06T10:00:00.000000', settlements: '2026-11-06T05:00:00.000000' }
    expect(marksAfter([expense(1, '2026-11-06T08:00:00Z', 10)], [], previous)).toEqual(previous)
  })
})

describe('readMarks / writeMarks', () => {
  const marks = { expenses: '2026-11-06T08:00:00.000000', settlements: null }

  test('kept per account and per house', () => {
    writeMarks(9, 7, marks)
    expect(readMarks(9, 7)).toEqual(marks)
    expect(readMarks(10, 7)).toBeNull()
    expect(readMarks(9, 8)).toBeNull()
  })

  test('something unreadable reads as no marks', () => {
    localStorage.setItem('fair-share:seen:9:7', '{not json')
    expect(readMarks(9, 7)).toBeNull()
    localStorage.setItem('fair-share:seen:9:7', '{"expenses": 3}')
    expect(readMarks(9, 7)).toBeNull()
  })

  test('a blocked storage never throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readMarks(9, 7)).toBeNull()
    expect(() => writeMarks(9, 7, marks)).not.toThrow()
  })
})
