import { describe, expect, test } from 'vitest'

import type { Expense, MemberBalance, Transfer } from '../api/types'
import { reminderMessage, spentInMonth, tookPart, transferText, verdict } from './verdict'

const names: Record<number, string> = { 1: 'Tiến', 2: 'Minh', 3: 'Anh', 4: 'Lan', 5: 'Hương' }
const nameOf = (id: number) => names[id] ?? 'Thành viên đã xoá'
const t = (from: number, to: number, amount: number): Transfer => ({
  from_member_id: from,
  to_member_id: to,
  amount,
})

describe('verdict', () => {
  test('you owe one, two or three people', () => {
    expect(verdict([t(1, 2, 120_000), t(3, 2, 80_000)], 1, nameOf, true)).toEqual({
      sentence: 'Bạn cần trả Minh',
      total: 120_000,
    })
    expect(verdict([t(1, 2, 120_000), t(1, 4, 30_000)], 1, nameOf, true)).toEqual({
      sentence: 'Bạn cần trả Minh và Lan',
      total: 150_000,
    })
    expect(verdict([t(1, 2, 1), t(1, 4, 2), t(1, 5, 3)], 1, nameOf, true)).toEqual({
      sentence: 'Bạn cần trả 3 người',
      total: 6,
    })
  })

  test('you are owed by one, two or three people', () => {
    expect(verdict([t(1, 2, 120_000), t(3, 2, 80_000)], 2, nameOf, true)).toEqual({
      sentence: 'Bạn được nhận từ Tiến và Anh',
      total: 200_000,
    })
    expect(verdict([t(3, 2, 80_000)], 2, nameOf, true).sentence).toBe('Bạn được nhận từ Anh')
    expect(verdict([t(1, 2, 1), t(3, 2, 1), t(4, 2, 1)], 2, nameOf, true).sentence).toBe(
      'Bạn được nhận từ 3 người',
    )
  })

  test('you are in no transfer, nobody is chosen, nothing is left', () => {
    const two = [t(1, 2, 120_000), t(3, 2, 80_000)]
    expect(verdict(two, 4, nameOf, true)).toEqual({ sentence: 'Bạn không nợ ai. Còn 2 lần trả trong nhà.', total: null })
    expect(verdict(two, null, nameOf, true)).toEqual({ sentence: 'Còn 2 lần trả là cả nhà về 0đ', total: null })
    expect(verdict([], 1, nameOf, true)).toEqual({ sentence: 'Cả nhà sạch nợ. Nhà trọ bình yên.', total: null })
  })

  test('a household that has not spent anything yet is not "sạch nợ"', () => {
    expect(verdict([], null, nameOf, false).sentence).toBe('Chưa có khoản chi nào. Ghi khoản đầu tiên để xem ai trả ai.')
  })

  test('a removed member is named as such', () => {
    expect(verdict([t(1, 99, 5)], 1, nameOf, true).sentence).toBe('Bạn cần trả Thành viên đã xoá')
  })
})

test('a transfer reads from where you stand', () => {
  expect(transferText(t(1, 2, 1), 1, nameOf)).toBe('Bạn trả Minh')
  expect(transferText(t(2, 1, 1), 1, nameOf)).toBe('Minh trả bạn')
  expect(transferText(t(3, 2, 1), 1, nameOf)).toBe('Anh trả Minh')
  expect(transferText(t(3, 2, 1), null, nameOf)).toBe('Anh trả Minh')
})

test('the reminder names everyone and links to the household', () => {
  expect(
    reminderMessage('Nhà trọ Q7', 10, [t(1, 2, 120_000), t(3, 2, 80_000)], nameOf, 'https://x.test/households/1'),
  ).toBe(
    'Nhà trọ Q7 chốt sổ tháng 10 nè:\n• Tiến trả Minh 120.000đ\n• Anh trả Minh 80.000đ\nXem chi tiết: https://x.test/households/1',
  )
})

test('only this month counts towards what the household spent', () => {
  const e = (spent_at: string, amount: number) => ({ spent_at, amount }) as Expense
  expect(spentInMonth([e('2026-10-01', 100), e('2026-10-31', 50), e('2026-09-30', 7), e('2025-10-10', 9)], '2026-10-21')).toBe(150)
  expect(spentInMonth([], '2026-10-21')).toBe(0)
})

test('taking part means any money at all, not a non-zero balance', () => {
  const b = (paid: number, owed: number, sent = 0, received = 0) =>
    ({ paid, owed, sent, received, net: 0 }) as MemberBalance
  expect(tookPart(b(0, 0))).toBe(false)
  expect(tookPart(b(100, 100))).toBe(true)
  expect(tookPart(b(0, 0, 0, 5))).toBe(true)
})
