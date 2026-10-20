import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import type { Member } from '../api/types'
import SettlementForm from './SettlementForm'

const members: Member[] = [
  { id: 1, household_id: 7, name: 'Tiến', created_at: '' },
  { id: 2, household_id: 7, name: 'Minh', created_at: '' },
]

function setup(onSubmit = vi.fn().mockResolvedValue({}), error: string | null = null) {
  render(<SettlementForm members={members} onSubmit={onSubmit} submitting={false} error={error} />)
  return { onSubmit, user: userEvent.setup() }
}

describe('SettlementForm', () => {
  test('records a payment with the body the API expects', async () => {
    const { user, onSubmit } = setup()
    await user.selectOptions(screen.getByLabelText('Người trả'), 'Minh')
    await user.selectOptions(screen.getByLabelText('Người nhận'), 'Tiến')
    await user.type(screen.getByLabelText('Số tiền (đồng)'), '120k')
    await user.type(screen.getByLabelText('Ghi chú (không bắt buộc)'), '  Chuyển khoản  ')
    await user.click(screen.getByRole('button', { name: 'Ghi nhận khoản trả' }))

    expect(onSubmit).toHaveBeenCalledWith({
      from_member_id: 2,
      to_member_id: 1,
      amount: 120_000,
      settled_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      note: 'Chuyển khoản',
    })
    expect(screen.getByLabelText('Số tiền (đồng)')).toHaveValue('')
  })

  test('a blank note is not sent at all', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Số tiền (đồng)'), '50000')
    await user.click(screen.getByRole('button', { name: 'Ghi nhận khoản trả' }))

    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('note')
  })

  test('paying yourself is refused before reaching the API', async () => {
    const { user, onSubmit } = setup()
    await user.selectOptions(screen.getByLabelText('Người nhận'), 'Tiến')
    await user.type(screen.getByLabelText('Số tiền (đồng)'), '50000')
    await user.click(screen.getByRole('button', { name: 'Ghi nhận khoản trả' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('hai người khác nhau')
  })

  test('an amount that is not a number is refused', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Số tiền (đồng)'), 'một trăm')
    await user.click(screen.getByRole('button', { name: 'Ghi nhận khoản trả' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Số tiền chưa hợp lệ')
  })

  test('when saving fails the amount stays and the server message shows', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('422'))
    const { user } = setup(failing, 'Một người không thể tự trả cho chính mình.')
    await user.type(screen.getByLabelText('Số tiền (đồng)'), '50000')
    await user.click(screen.getByRole('button', { name: 'Ghi nhận khoản trả' }))

    expect(screen.getByLabelText('Số tiền (đồng)')).toHaveValue('50000')
    expect(screen.getByRole('alert')).toHaveTextContent('tự trả cho chính mình')
  })
})
