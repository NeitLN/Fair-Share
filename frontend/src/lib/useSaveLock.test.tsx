import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'

import { useSaveLock } from './useSaveLock'

function Form({ locked, onFold }: { locked: boolean; onFold: () => void }) {
  const lock = useSaveLock(locked)
  const [paid, setPaid] = useState('a')
  const [ticked, setTicked] = useState(false)
  return (
    <form {...lock.form}>
      <input aria-label="Ghi chú" defaultValue="x" {...lock.text} />
      <label>
        <input type="radio" name="p" checked={paid === 'a'} {...lock.choice} onChange={() => setPaid('a')} />A
      </label>
      <label>
        <input type="radio" name="p" checked={paid === 'b'} {...lock.choice} onChange={() => setPaid('b')} />B
      </label>
      <label>
        <input type="checkbox" checked={ticked} {...lock.choice} onChange={(e) => setTicked(e.target.checked)} />
        Lặp lại
      </label>
      <button type="button" aria-expanded={false} onClick={onFold}>
        Đổi
      </button>
    </form>
  )
}

// specs/018-safe-saves, research R5
test('locked: text is read-only, choices do not change, folds still open, and the focus stays', async () => {
  const onFold = vi.fn()
  render(<Form locked onFold={onFold} />)
  const user = userEvent.setup()

  const note = screen.getByLabelText('Ghi chú')
  await user.click(note)
  await user.type(note, 'yz')
  expect(note).toHaveValue('x')
  expect(note).toHaveFocus()

  await user.click(screen.getByLabelText('B'))
  expect(screen.getByLabelText('B')).not.toBeChecked()
  await user.click(screen.getByLabelText('Lặp lại'))
  expect(screen.getByLabelText('Lặp lại')).not.toBeChecked()
  expect(screen.getByLabelText('Lặp lại')).toHaveAttribute('aria-disabled', 'true')

  await user.click(screen.getByRole('button', { name: 'Đổi' }))
  expect(onFold).toHaveBeenCalledOnce()
  expect(document.querySelector('form')).toHaveAttribute('aria-busy', 'true')
})

test('unlocked: nothing is in the way', async () => {
  render(<Form locked={false} onFold={() => {}} />)
  const user = userEvent.setup()
  await user.click(screen.getByLabelText('B'))
  expect(screen.getByLabelText('B')).toBeChecked()
  expect(document.querySelector('form')).not.toHaveAttribute('aria-busy')
})
