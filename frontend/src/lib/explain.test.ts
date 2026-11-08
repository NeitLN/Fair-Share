import { describe, expect, test } from 'vitest'

import type { Expense, MemberBalance, Notice, Settlement } from '../api/types'
import { explain } from './explain'
import type { ExplanationLine } from './explain'

// The seed's Nhà trọ Bình Thạnh: Tiến 1, Minh 2, Duy Anh 3 (specs/002-balance-explanation/quickstart.md)
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
const expenses = [
  expense(1, '2026-10-01', 4_500_000, 2, [[1, 1_500_000], [2, 1_500_000], [3, 1_500_000]]),
  expense(2, '2026-10-12', 360_000, 3, [[1, 120_000], [2, 120_000], [3, 120_000]]),
  expense(3, '2026-11-03', 450_000, 1, [[1, 150_000], [2, 150_000], [3, 150_000]]),
  expense(4, '2026-11-04', 240_000, 2, [[1, 80_000], [2, 80_000], [3, 80_000]]),
  // A custom split that leaves Minh out, with a 0 đồng share written for him
  expense(5, '2026-11-04', 100_000, 3, [[1, 40_000], [2, 0], [3, 60_000]]),
]
const settlements = [
  { id: 9, household_id: 1, from_member_id: 1, to_member_id: 2, amount: 1_000_000, settled_at: '2026-10-15', note: 'Trả trước một phần tiền nhà' },
] as Settlement[]
const balance = (member_id: number, paid: number, owed: number, sent: number, received: number): MemberBalance =>
  ({ member_id, name: '', paid, owed, sent, received, net: paid - owed + sent - received }) as MemberBalance
const tien = balance(1, 450_000, 1_890_000, 1_000_000, 0)
const minh = balance(2, 4_740_000, 1_850_000, 0, 1_000_000)
const notice = (from: number, to: number, amount: number, status: Notice['status']) =>
  ({ household_id: 1, from_member_id: from, to_member_id: to, amount, status, created_at: '', version: 1 }) as Notice

describe('the four lines', () => {
  test('come in a fixed order, from the balance, and add up to its net', () => {
    const e = explain(tien, expenses, settlements, [])
    expect(e.memberId).toBe(1)
    expect(e.lines.map((l) => [l.kind, l.total])).toEqual([
      ['spent', 450_000],
      ['share', 1_890_000],
      ['paidBack', 1_000_000],
      ['gotBack', 0],
    ])
    const [spent, share, paidBack, gotBack] = e.lines.map((l) => l.total)
    expect(e.net).toBe(spent - share + paidBack - gotBack)
    expect(e.net).toBe(tien.net)
    expect(e.net).toBe(-440_000)
  })

  test('someone who is owed has a positive net', () => {
    expect(explain(minh, expenses, settlements, []).net).toBe(1_890_000)
  })

  test('a "Tôi đã chuyển" waiting for an answer changes no total and is listed apart (ACCOUNTS.md S3)', () => {
    const notices = [notice(1, 2, 440_000, 'sent'), notice(3, 1, 5_000, 'declined'), notice(3, 2, 1_450_000, 'sent')]
    const e = explain(tien, expenses, settlements, notices)
    expect(e.net).toBe(-440_000)
    expect(e.lines.map((l) => l.total)).toEqual([450_000, 1_890_000, 1_000_000, 0])
    // Only his own, only while waiting
    expect(e.waiting).toEqual([{ otherMemberId: 2, amount: 440_000, iSent: true }])
    expect(explain(minh, expenses, settlements, notices).waiting).toEqual([
      { otherMemberId: 1, amount: 440_000, iSent: false },
      { otherMemberId: 3, amount: 1_450_000, iSent: false },
    ])
  })
})

describe('the items behind each line', () => {
  const ids = (line: ExplanationLine) =>
    line.items.map((item) => (item.kind === 'expense' ? item.expenseId : item.settlementId))

  test('what someone spent: the expenses they paid for, whole', () => {
    const [spent] = explain(tien, expenses, settlements, []).lines
    expect(spent.items).toEqual([
      { kind: 'expense', expenseId: 3, description: 'Khoản 3', spentAt: '2026-11-03', payerId: 1, amount: 450_000, part: 450_000 },
    ])
    expect(spent.inStep).toBe(true)
  })

  test('their share: every expense they have a part in, newest first, adding up to the line', () => {
    const share = explain(tien, expenses, settlements, []).lines[1]
    // Same day: the later one (higher id) first
    expect(ids(share)).toEqual([5, 4, 3, 2, 1])
    expect(share.items.reduce((sum, item) => sum + ('part' in item ? item.part : 0), 0)).toBe(1_890_000)
    expect(share.items[0]).toMatchObject({ payerId: 3, amount: 100_000, part: 40_000 })
    expect(share.inStep).toBe(true)
  })

  test('a 0 đồng share is not listed (invariant 4)', () => {
    const share = explain(minh, expenses, settlements, []).lines[1]
    expect(ids(share)).toEqual([4, 3, 2, 1])
    expect(share.inStep).toBe(true)
  })

  test('repayments made and received, with the other person and the note', () => {
    const [, , paidBack, gotBack] = explain(tien, expenses, settlements, []).lines
    expect(paidBack.items).toEqual([
      { kind: 'repayment', settlementId: 9, settledAt: '2026-10-15', otherMemberId: 2, amount: 1_000_000, note: 'Trả trước một phần tiền nhà' },
    ])
    expect(gotBack.items).toEqual([])
    expect(explain(minh, expenses, settlements, []).lines[3].items).toMatchObject([{ settlementId: 9, otherMemberId: 1 }])
  })

  test('someone who left keeps their id in the items (invariant 5)', () => {
    const gone = [expense(20, '2026-11-01', 90_000, 99, [[1, 45_000], [99, 45_000]])]
    const share = explain(balance(1, 0, 45_000, 0, 0), gone, [], []).lines[1]
    expect(share.items).toMatchObject([{ expenseId: 20, payerId: 99, part: 45_000 }])
  })

  test('items that do not add up to the line yet are not in step (research R2)', () => {
    // The balances came back with the new expense, the expense list not yet
    const share = explain(tien, expenses.slice(0, 4), settlements, []).lines[1]
    expect(share.inStep).toBe(false)
    expect(explain(tien, expenses.slice(0, 4), settlements, []).lines[0].inStep).toBe(true)
  })
})
