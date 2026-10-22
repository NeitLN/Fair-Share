import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Expense, Member } from '../api/types'
import ExpenseList from './ExpenseList'

const members: Member[] = [
  { id: 1, household_id: 7, name: 'Hoàng Minh', created_at: '2026-10-01T00:00:00Z' },
  { id: 2, household_id: 7, name: 'Tiến', created_at: '2026-10-02T00:00:00Z' },
  { id: 3, household_id: 7, name: 'Lan', created_at: '2026-10-03T00:00:00Z' },
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
    { member_id: 1, amount: 80000 },
    { member_id: 2, amount: 80000 },
    { member_id: 3, amount: 80000 },
  ],
}

const dinner: Expense = {
  id: 12,
  household_id: 7,
  description: 'Ăn tối',
  amount: 90000,
  payer_id: 2,
  spent_at: '2026-10-18',
  source: 'ai',
  created_at: '2026-10-18T20:00:00Z',
  split_type: 'custom',
  shares: [
    { member_id: 1, amount: 30000 },
    { member_id: 2, amount: 60000 },
  ],
}

const tea: Expense = {
  ...electricity,
  id: 13,
  description: 'Trà sữa',
  amount: 60000,
  payer_id: 3,
  created_at: '2026-10-20T15:00:00Z',
  shares: [
    { member_id: 2, amount: 30000 },
    { member_id: 3, amount: 30000 },
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

// Day labels depend on today: this is Wednesday 21/10/2026
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 21, 12))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const open = (description: string) => userEvent.click(screen.getByText(description))

describe('ExpenseList', () => {
  test('groups the expenses by day, newest day and newest entry first', () => {
    renderList([dinner, electricity, tea])

    const days = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(days).toEqual(['Hôm qua, 20/10', 'Chủ nhật, 18/10'])
    const yesterday = within(screen.getByRole('region', { name: 'Hôm qua, 20/10' }))
    expect(yesterday.getAllByRole('listitem').map((row) => row.querySelector('.expense-description')?.textContent)).toEqual([
      'Trà sữa',
      'Tiền điện',
    ])
  })

  test('a row says what, how much, who paid by short name and how it was split', () => {
    renderList([electricity, dinner, tea])

    const row = (description: string) => screen.getByText(description).closest('li') as HTMLElement
    expect(row('Tiền điện')).toHaveTextContent(/Tiền điện.*Minh trả · chia đều 3 người.*240\.000đ/)
    expect(row('Trà sữa')).toHaveTextContent('Lan trả · chia đều 2/3 người')
    expect(row('Ăn tối')).toHaveTextContent('Tiến trả · chia riêng 2 người')
  })

  test('old expenses are described by who shared them, not by how many members there are today', () => {
    // Lan has left since; Tiến, Minh and Lan shared the electricity
    const today = members.filter((m) => m.id !== 3)
    renderList([electricity], { members: today })
    expect(screen.getByText(/^Minh trả/)).toHaveTextContent('Minh trả · chia đều 3 người')
  })

  test('the same number of people is not "the whole house" when they are not today\'s members', () => {
    // Lan left and Hương joined: three members today, but not the three who shared
    const today = [...members.filter((m) => m.id !== 3), { id: 4, household_id: 7, name: 'Hương', created_at: '' }]
    renderList([{ ...tea, shares: [{ member_id: 2, amount: 30000 }, { member_id: 3, amount: 30000 }] }], {
      members: today,
    })
    expect(screen.getByText(/trả ·/)).toHaveTextContent('chia đều 2 người')
  })

  test('inside a day, the expense entered last comes first, whatever the timestamp precision', () => {
    renderList([
      { ...electricity, id: 21, description: 'Sáng', created_at: '2026-10-20T08:00:00.900Z' },
      { ...electricity, id: 20, description: 'Trưa', created_at: '2026-10-20T15:00:00+07:00' },
      { ...electricity, id: 22, description: 'Tối', created_at: '2026-10-20T09:00:00Z' },
    ])
    const order = screen.getAllByRole('listitem').map((row) => row.querySelector('.expense-description')?.textContent)
    // 15:00 in Vietnam is 08:00 UTC: Tối (09:00Z), then Sáng (08:00:00.9Z), then Trưa (08:00Z)
    expect(order).toEqual(['Tối', 'Sáng', 'Trưa'])
  })

  test('expenses made with Quick add keep the ✦ AI chip', () => {
    renderList([electricity, dinner])
    expect(within(screen.getByText('Ăn tối').closest('li') as HTMLElement).getByText('✦ AI')).toBeInTheDocument()
    expect(within(screen.getByText('Tiền điện').closest('li') as HTMLElement).queryByText('✦ AI')).not.toBeInTheDocument()
  })

  test('a payer missing from members is shown as deleted, not as a blank', () => {
    renderList([{ ...electricity, payer_id: 99 }])
    expect(screen.getByText(/^Thành viên đã xoá trả/)).toBeInTheDocument()
  })

  test('tapping a row reveals Sửa and Xoá', async () => {
    renderList([electricity])
    const details = screen.getByText('Tiền điện').closest('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    await open('Tiền điện')
    expect(details.open).toBe(true)
    expect(within(details).getByRole('button', { name: 'Sửa Tiền điện' })).toBeInTheDocument()
  })

  test('editing calls onEdit with that expense', async () => {
    const onEdit = vi.fn()
    renderList([electricity, dinner], { onEdit })

    await open('Tiền điện')
    await userEvent.click(screen.getByRole('button', { name: 'Sửa Tiền điện' }))
    expect(onEdit).toHaveBeenCalledWith(electricity)
  })

  test('deleting asks first, and cancel leaves the expense alone', async () => {
    const onDelete = vi.fn()
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    renderList([electricity], { onDelete })

    await open('Tiền điện')
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
    expect(screen.getByText('Chưa có khoản chi nào. Ghi khoản đầu tiên ở trên.')).toBeInTheDocument()
    unmount()

    renderList([], { error: 'Không kết nối được tới máy chủ.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Không kết nối được tới máy chủ.')
    expect(screen.queryByText(/Chưa có khoản chi nào/)).not.toBeInTheDocument()
  })

  test('shows skeleton rows instead of the list while loading', () => {
    renderList([electricity], { loading: true })
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải danh sách khoản chi')
    expect(screen.queryByText('Tiền điện')).not.toBeInTheDocument()
  })

  test('a failed load offers Thử lại, and the button is disabled while it reloads', async () => {
    const onRetry = vi.fn()
    const { rerender } = renderList([], { error: 'Máy chủ gặp lỗi.', onRetry })
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(onRetry).toHaveBeenCalledOnce()

    rerender(
      <ExpenseList
        expenses={[]}
        members={members}
        loading={false}
        error="Máy chủ gặp lỗi."
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onRetry={onRetry}
        retrying
      />,
    )
    expect(screen.getByRole('button', { name: 'Đang thử lại…' })).toBeDisabled()
    expect(screen.queryByText(/Chưa có khoản chi nào/)).not.toBeInTheDocument()
  })
})

describe('ExpenseList, keyboard', () => {
  test('Escape closes an opened row and focuses its summary', async () => {
    renderList([electricity])
    const user = userEvent.setup()
    const row = screen.getByText('Tiền điện').closest('details') as HTMLDetailsElement
    await user.click(screen.getByText('Tiền điện'))
    expect(row.open).toBe(true)
    screen.getByRole('button', { name: 'Sửa Tiền điện' }).focus()

    await user.keyboard('{Escape}')

    expect(row.open).toBe(false)
    expect(row.querySelector('summary')).toHaveFocus()
  })
})
