import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { mockApi, renderApp } from '../test/renderApp'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const T = '2026-10-20T10:00:00Z'
const people = ['Võ Việt Tiến', 'Hoàng Minh', 'Nguyễn Duy Anh', 'Lan'].map((name, i) => ({
  id: 11 + i,
  household_id: 7,
  name,
  created_at: T,
}))
const house: Record<string, [number, unknown]> = {
  'GET /api/households/7': [200, { id: 7, name: 'Nhà trọ Q7', created_at: T }],
  'GET /api/households/7/members': [200, people],
}

test('shows the household name above its tabs', async () => {
  mockApi({
    'GET /api/households/7': [200, { id: 7, name: 'Nhà trọ Q7', created_at: '' }],
  })
  renderApp('/households/7')
  expect(await screen.findByText('Nhà trọ Q7')).toBeInTheDocument()
})

test('a household that does not exist says so instead of empty tabs', async () => {
  mockApi({})
  renderApp('/households/99/members')
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Không tìm thấy nhà này' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Mục của nhà' })).not.toBeInTheDocument()
})

test('a non-numeric id never reaches the API', async () => {
  const fetchFn = mockApi({})
  renderApp('/households/abc')
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Không tìm thấy nhà này' }),
  ).toBeInTheDocument()
  expect(fetchFn).not.toHaveBeenCalled()
})

test('the house shows three of its people, then how many more, named for screen readers', async () => {
  mockApi(house)
  renderApp('/households/7')
  const stack = await screen.findByRole('img', {
    name: '4 người: Võ Việt Tiến, Hoàng Minh, Nguyễn Duy Anh, Lan',
  })
  expect(stack).toHaveTextContent('TMA+1')
})

test('"Bạn là ai?": choosing a member is remembered for this household and can be changed', async () => {
  mockApi(house)
  renderApp('/households/7')
  await userEvent.click(await screen.findByRole('button', { name: 'Chọn' }))
  await userEvent.click(screen.getByRole('radio', { name: 'Anh' }))

  expect(screen.getByText('Anh', { selector: '.who-am-i b' })).toBeInTheDocument()
  expect(localStorage.getItem('fair-share:me:7')).toBe('13')
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()

  // Change it, then Escape keeps the current choice
  await userEvent.click(screen.getByRole('button', { name: 'Không phải bạn?' }))
  expect(screen.getByRole('radio', { name: 'Anh' })).toBeChecked()
  await userEvent.keyboard('{Escape}')
  expect(screen.getByRole('button', { name: 'Không phải bạn?' })).toBeInTheDocument()
})

test('a saved choice greets you on the next visit', async () => {
  localStorage.setItem('fair-share:me:7', '12')
  mockApi(house)
  renderApp('/households/7/members')
  expect(await screen.findByText('Minh', { selector: '.who-am-i b' })).toBeInTheDocument()
})
