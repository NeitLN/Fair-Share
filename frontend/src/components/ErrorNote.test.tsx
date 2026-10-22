import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import ErrorNote from './ErrorNote'

describe('ErrorNote', () => {
  test('shows the message as an alert', () => {
    render(<ErrorNote message="Không kết nối được tới máy chủ." />)

    expect(screen.getByRole('alert')).toHaveTextContent('Không kết nối được tới máy chủ.')
  })

  test('has no retry button without onRetry', () => {
    render(<ErrorNote message="Không kết nối được tới máy chủ." />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  test('the retry button calls onRetry', async () => {
    const onRetry = vi.fn()
    render(<ErrorNote message="Không kết nối được tới máy chủ." onRetry={onRetry} />)

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  test('while retrying the button is disabled and says so', () => {
    render(<ErrorNote message="Không kết nối được tới máy chủ." onRetry={vi.fn()} retrying />)

    const button = screen.getByRole('button', { name: 'Đang thử lại…' })
    expect(button).toBeDisabled()
  })
})
