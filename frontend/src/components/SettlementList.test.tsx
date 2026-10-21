import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { Member, Settlement } from '../api/types'
import { memberLooks } from '../lib/names'
import SettlementList from './SettlementList'

const members: Member[] = [
  { id: 1, household_id: 7, name: 'Minh', created_at: '2026-10-01T00:00:00Z' },
  { id: 2, household_id: 7, name: 'Tiến', created_at: '2026-10-02T00:00:00Z' },
  { id: 3, household_id: 7, name: 'An', created_at: '2026-10-03T00:00:00Z' },
]

const settlements: Settlement[] = [
  {
    id: 21,
    household_id: 7,
    from_member_id: 2,
    to_member_id: 1,
    amount: 150000,
    settled_at: '2026-10-18',
    note: 'Trả tiền điện tháng 10',
    created_at: '2026-10-18T09:00:00Z',
  },
  {
    id: 22,
    household_id: 7,
    from_member_id: 3,
    to_member_id: 1,
    amount: 50000,
    settled_at: '2026-10-19',
    note: null,
    created_at: '2026-10-19T09:00:00Z',
  },
]

function renderList(overrides: Partial<Parameters<typeof SettlementList>[0]> = {}) {
  return render(
    <SettlementList settlements={settlements} looks={memberLooks(members)} onDelete={vi.fn()} {...overrides} />,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SettlementList', () => {
  test('each row says who paid whom, how much, on which day, and shows the note', () => {
    renderList()

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)

    const first = within(rows[0])
    expect(first.getByText('Tiến')).toBeInTheDocument()
    expect(first.getByText('Minh')).toBeInTheDocument()
    expect(first.getByText(/150\.000/)).toBeInTheDocument()
    expect(first.getByText(/18\/10 · Trả tiền điện tháng 10$/)).toBeInTheDocument()

    const second = within(rows[1])
    expect(second.getByText('An')).toBeInTheDocument()
    expect(second.getByText(/50\.000/)).toBeInTheDocument()
    expect(second.getByText(/19\/10$/)).toBeInTheDocument()
  })

  test('deleting asks first, and cancel leaves the settlement alone', async () => {
    const onDelete = vi.fn()
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    renderList({ onDelete })

    await userEvent.click(screen.getByRole('button', { name: /^Xoá khoản Tiến trả Minh 150\.000/ }))
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/^Xoá khoản Tiến trả Minh 150\.000đ\?$/))
    expect(onDelete).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: /^Xoá khoản Tiến trả Minh 150\.000/ }))
    expect(onDelete).toHaveBeenCalledWith(settlements[0])
  })

  test('only the settlement being deleted has its button disabled', () => {
    renderList({ deletingId: 21 })

    expect(screen.getByRole('button', { name: /^Xoá khoản Tiến trả Minh 150\.000/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Xoá khoản Tiến trả Minh 150\.000/ })).toHaveTextContent(
      'Đang xoá…',
    )
    expect(screen.getByRole('button', { name: /^Xoá khoản An trả Minh 50\.000/ })).toBeEnabled()
  })

  test('a member missing from the list is named as deleted', () => {
    renderList({
      settlements: [{ ...settlements[0], from_member_id: 99, to_member_id: 98 }],
    })
    expect(screen.getAllByText('Thành viên đã xoá')).toHaveLength(2)
  })

  test('shows the empty message only when there is no error', () => {
    const { unmount } = renderList({ settlements: [] })
    expect(screen.getByText(/^Chưa có khoản trả nào/)).toBeInTheDocument()
    unmount()

    renderList({ settlements: [], error: 'Không kết nối được tới máy chủ.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Không kết nối được tới máy chủ.')
    expect(screen.queryByText(/^Chưa có khoản trả nào/)).not.toBeInTheDocument()
  })

  test('shows a loading message instead of the list', () => {
    renderList({ loading: true })
    expect(screen.getByText('Đang tải các khoản trả…')).toBeInTheDocument()
    expect(screen.queryByText('Tiến')).not.toBeInTheDocument()
  })

  test('two payments by the same person get different delete labels', () => {
    renderList({ settlements: [settlements[0], { ...settlements[0], id: 23, amount: 20000 }] })

    expect(screen.getByRole('button', { name: /^Xoá khoản Tiến trả Minh 150\.000/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Xoá khoản Tiến trả Minh 20\.000/ })).toBeInTheDocument()
  })
})
