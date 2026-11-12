import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'

import { mockApi, renderApp } from '../test/renderApp'

// Review 12/11, D09 and E04: a page of its own, a title in the tab, and a way past the header
test('an unknown address has its own title and a way back that is a button to press', async () => {
  mockApi({})
  renderApp('/khong-co')
  expect(await screen.findByRole('heading', { level: 1, name: 'Không tìm thấy trang' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Về danh sách các nhà' })).toHaveClass('btn-primary')
  expect(document.title).toMatch(/^Không tìm thấy trang · /)
})

test('the first stop for the keyboard skips to the page', async () => {
  mockApi({})
  const user = userEvent.setup()
  renderApp('/khong-co')
  await screen.findByRole('heading', { level: 1 })
  await user.tab()
  const skip = screen.getByRole('link', { name: 'Bỏ qua, tới nội dung' })
  expect(skip).toHaveFocus()
  expect(skip).toHaveAttribute('href', '#main')
  expect(document.getElementById('main')).toHaveAttribute('tabindex', '-1')
})

// Review 12/11, E04: the link pressed is gone with its page, so the focus goes to the new page's title
test('after moving to another page, the focus starts at its title', async () => {
  mockApi({ 'GET /api/households': [200, { households: [], pending: [] }] })
  const user = userEvent.setup()
  renderApp('/khong-co')
  await user.click(await screen.findByRole('link', { name: 'Về danh sách các nhà' }))
  const title = await screen.findByRole('heading', { level: 1, name: 'Nhà của bạn' })
  await waitFor(() => expect(title).toHaveFocus())
})