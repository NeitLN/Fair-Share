import { describe, expect, test } from 'vitest'

import type { Notice, Settlement } from '../api/types'
import { classify, raceOf, snapshot } from './notices'

const notice = (amount: number, extra: Partial<Notice> = {}): Notice => ({
  from_member_id: 2,
  to_member_id: 1,
  amount,
  status: 'sent',
  note: null,
  version: 7,
  created_at: '',
  ...extra,
})

const settlement = (id: number, extra: Partial<Settlement> = {}): Settlement =>
  ({
    id,
    household_id: 9,
    from_member_id: 2,
    to_member_id: 1,
    amount: 20000,
    settled_at: '2026-11-12',
    note: null,
    created_at: '',
    created_by: 1,
    notice_amount: 20000,
    ...extra,
  }) as Settlement

// specs/019, FR-001
describe('classify', () => {
  test('matched, over and unmatched against the suggestions, by direction', () => {
    expect(classify(notice(30000), [{ from_member_id: 2, to_member_id: 1, amount: 50000 }])).toEqual({
      kind: 'matched',
      suggestion: 50000,
      excess: 0,
    })
    expect(classify(notice(30000), [{ from_member_id: 2, to_member_id: 1, amount: 10000 }])).toEqual({
      kind: 'over',
      suggestion: 10000,
      excess: 20000,
    })
    expect(classify(notice(30000), [])).toEqual({ kind: 'unmatched', suggestion: 0, excess: 30000 })
    // The suggestion runs the other way: still nothing from the debtor to the receiver
    expect(classify(notice(30000), [{ from_member_id: 1, to_member_id: 2, amount: 30000 }]).kind).toBe('unmatched')
  })
})

// specs/019, FR-020
describe('raceOf', () => {
  const pair = { from: 2, to: 1 }
  const before = snapshot(notice(20000), [settlement(5)])

  test('declined since the press', () => {
    expect(raceOf(before, pair, notice(20000, { status: 'declined', version: 8 }), [settlement(5)])).toEqual({
      kind: 'declined',
      amount: 20000,
    })
  })

  test('recorded by the receiver: a new repayment that took notice money', () => {
    expect(raceOf(before, pair, undefined, [settlement(5), settlement(6)])).toEqual({ kind: 'confirmed', amount: 20000 })
  })

  test('taken back: gone, and nothing recorded', () => {
    expect(raceOf(before, pair, undefined, [settlement(5)])).toEqual({ kind: 'takenBack' })
  })

  test('anything it cannot prove is "changed"', () => {
    expect(raceOf(before, pair, notice(35000, { version: 9 }), [settlement(5)])).toEqual({ kind: 'changed' })
    // A repayment of another pair, or by hand without notice money, proves nothing
    expect(raceOf(before, pair, undefined, [settlement(5), settlement(6, { notice_amount: null })])).toEqual({
      kind: 'takenBack',
    })
    expect(raceOf(before, pair, undefined, [settlement(5), settlement(6), settlement(7)])).toEqual({ kind: 'changed' })
  })
})
