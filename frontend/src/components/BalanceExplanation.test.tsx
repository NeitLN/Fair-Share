import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, test } from 'vitest'

import type { Expense, MemberBalance, Notice, Settlement } from '../api/types'
import { explain } from '../lib/explain'
import { memberLooks } from '../lib/names'
import BalanceExplanation from './BalanceExplanation'

const members = [
  { id: 1, household_id: 7, name: 'Tiến', created_at: '' },
  { id: 2, household_id: 7, name: 'Minh', created_at: '' },
  { id: 3, household_id: 7, name: 'Nguyễn Duy Anh', created_at: '' },
]
const looks = memberLooks(members)
const balance = (member_id: number, paid: number, owed: number, sent: number, received: number): MemberBalance =>
  ({ member_id, name: '', paid, owed, sent, received, net: paid - owed + sent - received }) as MemberBalance
const tien = balance(1, 450_000, 1_890_000, 1_000_000, 0)
const notice = (from: number, to: number, amount: number): Notice =>
  ({ household_id: 7, from_member_id: from, to_member_id: to, amount, status: 'sent', created_at: '' }) as Notice

function show(b: MemberBalance, me: number | null, notices: Notice[] = []) {
  render(
    <MemoryRouter>
      <BalanceExplanation explanation={explain(b, [], [], notices)} looks={looks} me={me} householdId={7} />
    </MemoryRouter>,
  )
  return screen.getByRole('group', { name: b.member_id === me ? 'Số dư của bạn' : /^Số dư của / })
}

test('four signed lines worded for you, then the total with what it means (FR-004, FR-005, FR-006)', () => {
  const box = show(tien, 1)
  const lines = within(box).getAllByRole('listitem')
  expect(lines.map((l) => l.textContent)).toEqual([
    'Bạn đã chi cho cả nhà+450.000đ',
    'Phần của bạn trong các khoản chi−1.890.000đ',
    'Bạn đã trả lại+1.000.000đ',
    'Bạn đã nhận lạiKhông có khoản nào0đ',
  ])
  expect(within(box).getByText('Số dư').closest('p')).toHaveTextContent('Số dư−440.000đcần trả')
})

test("someone else's balance uses their short name", () => {
  const box = show(balance(3, 460_000, 1_910_000, 0, 0), 1)
  expect(box).toHaveAccessibleName('Số dư của Duy Anh')
  expect(within(box).getAllByRole('listitem')[0]).toHaveTextContent('Duy Anh đã chi cho cả nhà+460.000đ')
  expect(within(box).getByText('Số dư').closest('p')).toHaveTextContent('Số dư−1.450.000đcần trả')
})

test('owed money reads "được nhận", nothing left reads SẠCH NỢ', () => {
  show(balance(2, 4_740_000, 1_850_000, 0, 1_000_000), 2)
  expect(screen.getByText('Số dư').closest('p')).toHaveTextContent('Số dư+1.890.000đđược nhận')
})

test('a balance of 0 is SẠCH NỢ', () => {
  show(balance(1, 100_000, 100_000, 0, 0), 1)
  expect(screen.getByText('Số dư').closest('p')).toHaveTextContent('SẠCH NỢ')
})

test('a "Tôi đã chuyển" still waiting is said apart and counts in nothing (FR-011)', () => {
  const box = show(tien, 1, [notice(1, 2, 440_000), notice(2, 1, 5_000)])
  expect(within(box).getByText(/Bạn đã báo chuyển/)).toHaveTextContent(
    'Bạn đã báo chuyển 440.000đ cho Minh, chờ xác nhận: chưa tính vào số dư.',
  )
  expect(within(box).getByText(/Minh đã báo chuyển/)).toHaveTextContent(
    'Minh đã báo chuyển 5.000đ cho bạn, chờ xác nhận: chưa tính vào số dư.',
  )
  expect(within(box).getByText('Số dư').closest('p')).toHaveTextContent('−440.000đ')
})

describe('the items behind each line (US2)', () => {
  const expenses = [
    { id: 4, household_id: 7, description: 'Lẩu thứ sáu', amount: 240_000, payer_id: 2, spent_at: '2026-11-04', shares: [{ member_id: 1, amount: 80_000 }, { member_id: 2, amount: 80_000 }, { member_id: 3, amount: 80_000 }] },
    { id: 3, household_id: 7, description: 'Tiền điện', amount: 450_000, payer_id: 1, spent_at: '2026-11-03', shares: [{ member_id: 1, amount: 150_000 }, { member_id: 2, amount: 150_000 }, { member_id: 3, amount: 150_000 }] },
  ] as Expense[]
  const settlements = [
    { id: 9, household_id: 7, from_member_id: 1, to_member_id: 2, amount: 100_000, settled_at: '2026-10-15', note: 'Trả trước' },
  ] as Settlement[]
  const mine = balance(1, 450_000, 230_000, 100_000, 0)

  function open(b: MemberBalance, list: Expense[] = expenses) {
    render(
      <MemoryRouter>
        <BalanceExplanation explanation={explain(b, list, settlements, [])} looks={looks} me={1} householdId={7} />
      </MemoryRouter>,
    )
    return userEvent.setup()
  }

  test('a line opens its expenses: description as a link to Chi tiêu, who paid, the part and the whole (FR-007, FR-010)', async () => {
    const user = open(mine)
    await user.click(screen.getByText('Phần của bạn trong các khoản chi'))
    const items = within(screen.getByRole('list', { name: 'Phần của bạn trong các khoản chi' })).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByRole('link', { name: 'Lẩu thứ sáu' })).toHaveAttribute('href', '/households/7/expenses')
    expect(items[0]).toHaveTextContent('Minh trả')
    expect(items[0]).toHaveTextContent('trên tổng 240.000đ')
    expect(items[0]).toHaveTextContent('80.000đ')
    expect(screen.getByText('Bấm một khoản để xem trong mục Chi tiêu.')).toBeInTheDocument()
  })

  test('repayments link to their row in Lịch sử trả tiền, named by the other person', async () => {
    const user = open(mine)
    await user.click(screen.getByText('Bạn đã trả lại'))
    const item = within(screen.getByRole('list', { name: 'Bạn đã trả lại' })).getByRole('listitem')
    expect(within(item).getByRole('link', { name: 'cho Minh' })).toHaveAttribute('href', '#settlement-9')
    expect(item).toHaveTextContent('Trả trước')
    expect(item).toHaveTextContent('100.000đ')
  })

  test('a zero line cannot be opened (FR-009)', () => {
    open(mine)
    expect(screen.getByText('Bạn đã nhận lại').closest('details')).toBeNull()
  })

  test('items that do not add up yet say so instead of a wrong list (FR-015)', async () => {
    const user = open(mine, expenses.slice(0, 1))
    await user.click(screen.getByText('Phần của bạn trong các khoản chi'))
    expect(screen.getByText('Đang cập nhật…')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Lẩu thứ sáu' })).not.toBeInTheDocument()
  })

  test('nothing in the explanation changes data: no button at all (FR-010)', async () => {
    const user = open(mine)
    await user.click(screen.getByText('Phần của bạn trong các khoản chi'))
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
