import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

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
    expect(screen.getAllByRole('button', { name: 'Đổi tên' })).toHaveLength(2)
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
})
