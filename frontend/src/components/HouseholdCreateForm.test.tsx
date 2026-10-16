import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import HouseholdCreateForm from './HouseholdCreateForm'

describe('HouseholdCreateForm', () => {
  test('renders a labelled input and a submit button', () => {
    render(<HouseholdCreateForm onCreate={vi.fn()} submitting={false} error={null} />)
    expect(screen.getByLabelText('Tên nhà')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo nhà' })).toBeInTheDocument()
  })

  test('sends the trimmed name and clears the input once saved', async () => {
    const onCreate = vi.fn().mockResolvedValue({})
    render(<HouseholdCreateForm onCreate={onCreate} submitting={false} error={null} />)

    await userEvent.type(screen.getByLabelText('Tên nhà'), '  Nhà 12  ')
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhà' }))

    expect(onCreate).toHaveBeenCalledWith('Nhà 12')
    expect(screen.getByLabelText('Tên nhà')).toHaveValue('')
  })

  test('keeps the text when saving fails', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('409'))
    render(<HouseholdCreateForm onCreate={onCreate} submitting={false} error={null} />)

    await userEvent.type(screen.getByLabelText('Tên nhà'), 'Nhà 12')
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhà' }))

    expect(screen.getByLabelText('Tên nhà')).toHaveValue('Nhà 12')
  })

  test('rejects a blank name without calling the API', async () => {
    const onCreate = vi.fn()
    render(<HouseholdCreateForm onCreate={onCreate} submitting={false} error={null} />)

    await userEvent.type(screen.getByLabelText('Tên nhà'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhà' }))

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Tên nhà phải từ 1 đến 60 ký tự.')
  })
})
