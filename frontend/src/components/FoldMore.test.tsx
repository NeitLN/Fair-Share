import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test } from 'vitest'

import FoldMore from './FoldMore'

beforeEach(() => localStorage.clear())

function renderFold() {
  return render(
    <>
      <a href="#settlement-30">Lan đã trả Tiến 50.000đ</a>
      <FoldMore householdId={7} name="history" summary="2 khoản trả">
        <ul>
          <li id="settlement-30">Lan đã trả Tiến 50.000đ</li>
        </ul>
      </FoldMore>
    </>,
  )
}

const fold = () => screen.getByText('2 khoản trả').closest('details') as HTMLDetailsElement

test('closed at first; opening it is remembered for the next visit', async () => {
  const user = userEvent.setup()
  const { unmount } = renderFold()
  expect(fold().open).toBe(false)
  await user.click(screen.getByText('2 khoản trả'))
  expect(fold().open).toBe(true)
  unmount()
  renderFold()
  expect(fold().open).toBe(true)
})

test('Escape closes it and puts the focus back on its line', async () => {
  const user = userEvent.setup()
  renderFold()
  await user.click(screen.getByText('2 khoản trả'))
  await user.keyboard('{Escape}')
  expect(fold().open).toBe(false)
  expect(screen.getByText('2 khoản trả')).toHaveFocus()
})

test('a link to something inside opens it first, so the browser can scroll there', async () => {
  const user = userEvent.setup()
  renderFold()
  await user.click(screen.getByRole('link', { name: 'Lan đã trả Tiến 50.000đ' }))
  expect(fold().open).toBe(true)
})
