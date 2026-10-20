import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { Expense, Member } from '../api/types'
import ExpenseList from './ExpenseList'

const members: Member[] = [
  { id: 1, household_id: 7, name: 'Minh', created_at: '2026-10-01T00:00:00Z' },
  { id: 2, household_id: 7, name: 'Tiến', created_at: '2026-10-02T00:00:00Z' },
]

const electricity: Expense = {
  id: 11,
  household_id: 7,
  description: 'Tiền điện',
  amount: 240000,
  payer_id: 1,
  spent_at: '2026-10-20',
  source: 'manual',
  created_at: '2026-10-20T10:00:00Z',
  split_type: 'equal',
  shares: [
    { member_id: 1, amount: 120000 },
    { member_id: 2, amount: 120000 },
  ],
}

const dinner: Expense = {
  id: 12,
  household_id: 7,
  description: 'Ăn tối',
  amount: 90000,
  payer_id: 2,
  spent_at: '2026-10-19',
  source: 'ai',
  created_at: '2026-10-19T20:00:00Z',
  split_type: 'custom',
  shares: [
    { member_id: 1, amount: 30000 },
    { member_id: 2, amount: 60000 },
  ],
}

function renderList(expenses: Expense[], overrides: Partial<Parameters<typeof ExpenseList>[0]> = {}) {
  return render(
    <ExpenseList
      expenses={expenses}
      members={members}
      loading={false}
      error={null}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      {...overrides}
    />,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ExpenseList', () => {
  test('shows description, amount, payer, date, split label and the AI badge', () => {
    renderList([electricity, dinner])

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)

    const first = within(rows[0])
    expect(first.getByText('Tiền điện')).toBeInTheDocument()
    expect(first.getByText(/240\.000/)).toBeInTheDocument()
    expect(first.getByText('Minh')).toBeInTheDocument()
    expect(first.getByText(/20\/10\/2026/)).toBeInTheDocument()
    expect(first.getByText(/Chia đều/)).toBeInTheDocument()
    expect(first.queryByText('AI')).not.toBeInTheDocument()

    const second = within(rows[1])
    expect(second.getByText('Ăn tối')).toBeInTheDocument()
    expect(second.getByText(/90\.000/)).toBeInTheDocument()
    expect(second.getByText('Tiến')).toBeInTheDocument()
    expect(second.getByText(/19\/10\/2026/)).toBeInTheDocument()
    expect(second.getByText(/Chia riêng/)).toBeInTheDocument()
    expect(second.getByText('AI')).toBeInTheDocument()
  })

  test('a payer missing from members is shown as deleted, not as a blank', () => {
    renderList([{ ...electricity, payer_id: 99 }])
    expect(screen.getByText('Thành viên đã xoá')).toBeInTheDocument()
  })

  test('editing calls onEdit with that expense', async () => {
    const onEdit = vi.fn()
    renderList([electricity, dinner], { onEdit })

    await userEvent.click(screen.getByRole('button', { name: 'Sửa Tiền điện' }))
    expect(onEdit).toHaveBeenCalledWith(electricity)
  })

  test('deleting asks first, and cancel leaves the expense alone', async () => {
    const onDelete = vi.fn()
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    renderList([electricity], { onDelete })

    await userEvent.click(screen.getByRole('button', { name: 'Xoá Tiền điện' }))
    expect(confirm).toHaveBeenCalledWith('Xoá khoản "Tiền điện"?')
    expect(onDelete).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Xoá Tiền điện' }))
    expect(onDelete).toHaveBeenCalledWith(electricity)
  })

  test('the expense being deleted has both buttons disabled', () => {
    renderList([electricity, dinner], { deletingId: 11 })

    expect(screen.getByRole('button', { name: 'Xoá Tiền điện' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sửa Tiền điện' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Xoá Ăn tối' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Sửa Ăn tối' })).toBeEnabled()
  })

  test('shows the empty message only when there is no error', () => {
    const { unmount } = renderList([])
    expect(screen.getByText('Chưa có khoản chi nào — thêm khoản đầu tiên ở trên.')).toBeInTheDocument()
    unmount()

    renderList([], { error: 'Không kết nối được tới máy chủ.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Không kết nối được tới máy chủ.')
    expect(screen.queryByText(/Chưa có khoản chi nào/)).not.toBeInTheDocument()
  })

  test('shows a loading message instead of the list', () => {
    renderList([electricity], { loading: true })
    expect(screen.getByText('Đang tải danh sách khoản chi…')).toBeInTheDocument()
    expect(screen.queryByText('Tiền điện')).not.toBeInTheDocument()
  })
})
