import { describe, expect, test } from 'vitest'

import type { MemberBalance, Transfer } from '../api/types'
import { reminderMessage, tookPart, transferText, verdict, verdictPeople } from './verdict'

const names: Record<number, string> = { 1: 'Tiến', 2: 'Minh', 3: 'Anh', 4: 'Lan', 5: 'Hương' }
const nameOf = (id: number) => names[id] ?? 'Thành viên cũ'
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
    expect(verdict(two, 4, nameOf, true)).toEqual({ sentence: 'Bạn đã xong phần mình. Cả nhà còn 2 lần trả.', total: null })
    expect(verdict(two, null, nameOf, true)).toEqual({ sentence: 'Còn 2 lần trả nữa là cả nhà sạch nợ.', total: null })
    expect(verdict([], 1, nameOf, true)).toEqual({ sentence: 'Cả nhà sạch nợ. Nhà trọ bình yên.', total: null })
  })

  test('a household that has not spent anything yet is not "sạch nợ"', () => {
    expect(verdict([], null, nameOf, false).sentence).toBe('Chưa có khoản chi nào. Ghi khoản đầu tiên để xem ai trả ai.')
  })

  test('a removed member is named as such', () => {
    expect(verdict([t(1, 99, 5)], 1, nameOf, true).sentence).toBe('Bạn cần trả Thành viên cũ')
  })
})

test('a transfer reads from where you stand', () => {
  expect(transferText(t(1, 2, 1), 1, nameOf)).toBe('Bạn cần trả Minh')
  expect(transferText(t(2, 1, 1), 1, nameOf)).toBe('Minh cần trả bạn')
  expect(transferText(t(3, 2, 1), 1, nameOf)).toBe('Anh cần trả Minh')
  expect(transferText(t(3, 2, 1), null, nameOf)).toBe('Anh cần trả Minh')
})

test('the reminder names everyone and links to the household', () => {
  expect(
    reminderMessage('Nhà trọ Q7', 10, [t(1, 2, 120_000), t(3, 2, 80_000)], nameOf, 'https://x.test/households/1'),
  ).toBe(
    'Nhà trọ Q7 ơi, còn mấy khoản cần trả nè:\n• Tiến trả Minh 120.000đ\n• Anh trả Minh 80.000đ\nXem chi tiết: https://x.test/households/1',
  )
})

test('the reminder names how much someone said they sent', () => {
  const told = [t(3, 2, 50_000)]
  expect(
    reminderMessage('Nhà trọ Q7', 10, [t(1, 2, 120_000), t(3, 2, 80_000)], nameOf, 'https://x.test/households/1', told),
  ).toContain('• Anh trả Minh 80.000đ (đã báo chuyển 50.000đ, chờ Minh xác nhận)')
})

test('a told transfer that is not suggested any more keeps a line of its own, asking for nothing', () => {
  const message = reminderMessage('Nhà trọ Q7', 10, [t(1, 2, 120_000)], nameOf, 'https://x.test/households/1', [
    t(3, 1, 40_000),
  ])
  expect(message.split('\n')).toEqual([
    'Nhà trọ Q7 ơi, còn mấy khoản cần trả nè:',
    '• Tiến trả Minh 120.000đ',
    '• Anh trả Tiến (đã báo chuyển 40.000đ)',
    'Xem chi tiết: https://x.test/households/1',
  ])
})

test('taking part means any money at all, not a non-zero balance', () => {
  const b = (paid: number, owed: number, sent = 0, received = 0) =>
    ({ paid, owed, sent, received, net: 0 }) as MemberBalance
  expect(tookPart(b(0, 0))).toBe(false)
  expect(tookPart(b(100, 100))).toBe(true)
  expect(tookPart(b(0, 0, 0, 5))).toBe(true)
})

// Owner, 07/11: the stickers in the verdict's corner are the people the money comes from
test('the verdict shows who sends you money, or who you send it to, never yourself', () => {
  const tr = (from: number, to: number) => ({ from_member_id: from, to_member_id: to, amount: 1 })
  expect(verdictPeople([tr(2, 1), tr(3, 1), tr(2, 3)], 1)).toEqual([2, 3])
  expect(verdictPeople([tr(1, 2), tr(1, 3)], 1)).toEqual([2, 3])
  expect(verdictPeople([tr(2, 1), tr(2, 1)], 1)).toEqual([2])
  expect(verdictPeople([tr(2, 3)], 1)).toEqual([])
  expect(verdictPeople([tr(2, 1)], null)).toEqual([])
})
