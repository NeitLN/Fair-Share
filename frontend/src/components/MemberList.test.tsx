import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { MemberBalance } from '../api/types'

import MemberList from './MemberList'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MemberList', () => {
  test('renders every member with rename and remove buttons', () => {
    render(
      <MemberList
        members={[
          { id: 1, household_id: 7, name: 'Minh', created_at: '2026-10-01T00:00:00Z' },
          { id: 2, household_id: 7, name: 'Tiến', created_at: '2026-10-02T00:00:00Z' },
        ]}
        loading={false}
        error={null}
        onRename={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText('Minh')).toBeInTheDocument()
    expect(screen.getByText('Tiến')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đổi tên Minh' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đổi tên Tiến' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xoá Minh' })).toBeInTheDocument()
  })

  test('a load error is not mistaken for an empty list', () => {
    render(
      <MemberList
        members={[]}
        loading={false}
        error="Không kết nối được tới máy chủ."
        onRename={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Không kết nối được tới máy chủ.')
    expect(screen.queryByText(/Chưa có thành viên nào/)).not.toBeInTheDocument()
  })

  test('the member being removed cannot be removed or renamed twice', () => {
    render(
      <MemberList
        members={[
          { id: 1, household_id: 7, name: 'Minh', created_at: '' },
          { id: 2, household_id: 7, name: 'Tiến', created_at: '' },
        ]}
        loading={false}
        error={null}
        onRename={vi.fn()}
        onRemove={vi.fn()}
        removingId={2}
      />,
    )
    expect(screen.getByRole('button', { name: 'Xoá Tiến' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Xoá Tiến' })).toHaveTextContent('Đang xoá…')
    expect(screen.getByRole('button', { name: 'Xoá Minh' })).toBeEnabled()
  })

  test('asks before removing, and does nothing on Cancel', async () => {
    const onRemove = vi.fn()
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    render(
      <MemberList
        members={[{ id: 1, household_id: 7, name: 'Minh', created_at: '' }]}
        loading={false}
        error={null}
        onRename={vi.fn()}
        onRemove={onRemove}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Xoá Minh' }))
    expect(confirm).toHaveBeenCalledWith('Xoá Minh khỏi nhà?')
    expect(onRemove).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Xoá Minh' }))
    expect(onRemove).toHaveBeenCalledWith(1)
  })

  const people = [
    { id: 1, household_id: 7, name: 'Hoàng Minh', created_at: '' },
    { id: 2, household_id: 7, name: 'Võ Việt Tiến', created_at: '' },
    { id: 3, household_id: 7, name: 'Lan', created_at: '' },
    { id: 4, household_id: 7, name: 'Hương', created_at: '' },
  ]
  const balance = (member_id: number, net: number, paid = 0, owed = 0): MemberBalance => ({
    member_id,
    name: '',
    paid,
    owed,
    sent: 0,
    received: 0,
    net,
  })

  test('each member shows their full name, what the app calls them and where they stand', () => {
    render(
      <MemberList
        members={people}
        balances={
          new Map([
            [1, balance(1, 200000, 300000, 100000)],
            [2, balance(2, -120000, 0, 120000)],
            [3, balance(3, 0, 50000, 50000)],
            [4, balance(4, 0)],
          ])
        }
        me={2}
        loading={false}
        error={null}
        onRename={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Hoàng Minhgọi là Minhđược nhận 200.000đ')
    expect(rows[1]).toHaveTextContent('Võ Việt Tiếnbạngọi là Tiếncần trả 120.000đ')
    // Took part and is back to 0: SẠCH NỢ; never took part: nothing to say yet
    expect(rows[2]).toHaveTextContent('SẠCH NỢ')
    expect(rows[3]).not.toHaveTextContent('SẠCH NỢ')
    // A one-word name needs no "gọi là"
    expect(rows[2]).not.toHaveTextContent('gọi là')
  })

  test('without balances (loading or failed) the rows simply have no chips', () => {
    render(<MemberList members={people} loading={false} error={null} onRename={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.queryByText(/cần trả|được nhận|SẠCH NỢ/)).not.toBeInTheDocument()
  })

  test('a failed remove is explained under that member, not somewhere else', () => {
    render(
      <MemberList
        members={people}
        loading={false}
        error={null}
        onRename={vi.fn()}
        onRemove={vi.fn()}
        rowError={{ id: 3, message: 'Không xoá được: người này đã có trong một khoản chi hoặc khoản trả.' }}
      />,
    )
    const rows = screen.getAllByRole('listitem')
    expect(rows[2]).toContainElement(screen.getByRole('alert'))
  })

  test('saving a rename twice sends it once', async () => {
    let finish: () => void = () => {}
    const onRename = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    render(
      <MemberList members={people} loading={false} error={null} onRename={onRename} onRemove={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Đổi tên Lan' }))
    await userEvent.type(screen.getByLabelText('Tên mới cho Lan'), ' Anh')
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Đang lưu…' }))
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onRename).toHaveBeenCalledWith(3, 'Lan Anh')
    finish()
  })
})
