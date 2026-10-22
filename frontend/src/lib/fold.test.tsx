import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { closeFoldOnEscape } from './fold'

function Fold({ onClosed = () => {} }: { onClosed?: () => void }) {
  return (
    <details
      onKeyDown={(event) => {
        if (closeFoldOnEscape(event)) onClosed()
      }}
    >
      <summary>Ghi khoản trả khác</summary>
      <label htmlFor="amount">Số tiền</label>
      <input id="amount" />
    </details>
  )
}

describe('closeFoldOnEscape', () => {
  test('Escape inside an open fold closes it and focuses its summary', async () => {
    const onClosed = vi.fn()
    render(<Fold onClosed={onClosed} />)
    const user = userEvent.setup()
    await user.click(screen.getByText('Ghi khoản trả khác'))
    await user.click(screen.getByLabelText('Số tiền'))

    await user.keyboard('{Escape}')

    expect(screen.getByRole('group')).not.toHaveAttribute('open')
    expect(screen.getByText('Ghi khoản trả khác')).toHaveFocus()
    expect(onClosed).toHaveBeenCalledOnce()
  })

  test('other keys and a closed fold are left alone', async () => {
    const onClosed = vi.fn()
    render(<Fold onClosed={onClosed} />)
    const user = userEvent.setup()
    screen.getByText('Ghi khoản trả khác').focus()

    await user.keyboard('{Escape}')
    await user.keyboard('a')

    expect(screen.getByRole('group')).not.toHaveAttribute('open')
    expect(onClosed).not.toHaveBeenCalled()
  })
})
