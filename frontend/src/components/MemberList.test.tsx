import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import MemberList from './MemberList'

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
})
