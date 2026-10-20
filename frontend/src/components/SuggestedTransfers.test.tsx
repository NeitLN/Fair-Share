import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import type { Member, Transfer } from '../api/types'
import SuggestedTransfers from './SuggestedTransfers'

const members: Member[] = [
  { id: 1, household_id: 7, name: 'Minh', created_at: '2026-10-01T00:00:00Z' },
  { id: 2, household_id: 7, name: 'Tiến', created_at: '2026-10-02T00:00:00Z' },
  { id: 3, household_id: 7, name: 'An', created_at: '2026-10-03T00:00:00Z' },
]

const suggested: Transfer[] = [
  { from_member_id: 2, to_member_id: 1, amount: 150000 },
  { from_member_id: 3, to_member_id: 1, amount: 50000 },
]

function renderList(overrides: Partial<Parameters<typeof SuggestedTransfers>[0]> = {}) {
  return render(
    <SuggestedTransfers
      suggested={suggested}
      members={members}
      onRecord={vi.fn()}
      {...overrides}
    />,
  )
}

describe('SuggestedTransfers', () => {
  test('each row names both members and the amount', () => {
    renderList()

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)

    const first = within(rows[0])
    expect(first.getByText('Tiến')).toBeInTheDocument()
    expect(first.getByText('Minh')).toBeInTheDocument()
    expect(first.getByText(/150\.000/)).toBeInTheDocument()
    expect(first.getByText(/trả/)).toBeInTheDocument()

    const second = within(rows[1])
    expect(second.getByText('An')).toBeInTheDocument()
    expect(second.getByText(/50\.000/)).toBeInTheDocument()
  })

  test('recording calls onRecord with that transfer', async () => {
    const onRecord = vi.fn()
    renderList({ onRecord })

    const buttons = screen.getAllByRole('button', { name: 'Ghi nhận khoản này' })
    await userEvent.click(buttons[1])

    expect(onRecord).toHaveBeenCalledWith(suggested[1])
  })

  test('only the transfer being recorded has its button disabled', () => {
    renderList({ recordingIndex: 0 })

    const buttons = screen.getAllByRole('button')
    expect(buttons[0]).toBeDisabled()
    expect(buttons[0]).toHaveTextContent('Đang ghi nhận…')
    expect(buttons[1]).toBeEnabled()
  })

  test('a member missing from the list is named as deleted', () => {
    renderList({ suggested: [{ from_member_id: 99, to_member_id: 1, amount: 10000 }] })
    expect(screen.getByText('Thành viên đã xoá')).toBeInTheDocument()
  })

  test('shows the settled message only when there is no error', () => {
    const { unmount } = renderList({ suggested: [] })
    expect(screen.getByText('Mọi người đã cân bằng, không ai nợ ai.')).toBeInTheDocument()
    unmount()

    renderList({ suggested: [], error: 'Không kết nối được tới máy chủ.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Không kết nối được tới máy chủ.')
    expect(screen.queryByText('Mọi người đã cân bằng, không ai nợ ai.')).not.toBeInTheDocument()
  })
})
