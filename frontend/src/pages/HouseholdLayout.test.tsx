import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { keyFor } from '../lib/knownHouseholds'
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
  // Moving through the people with the keyboard does not choose anyone
  expect(screen.getByRole('button', { name: 'Tiến' })).toHaveFocus()
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'Minh' })).toHaveFocus()
  expect(localStorage.getItem('fair-share:me:7')).toBeNull()

  await userEvent.click(screen.getByRole('button', { name: 'Anh' }))
  expect(screen.getByText('Anh', { selector: '.who-am-i b' })).toBeInTheDocument()
  expect(localStorage.getItem('fair-share:me:7')).toBe('13')
  expect(screen.queryByRole('group', { name: 'Bạn là ai trong nhà này?' })).not.toBeInTheDocument()

  // Reopening starts on the current choice; Escape keeps it and returns to the button
  await userEvent.click(screen.getByRole('button', { name: 'Không phải bạn?' }))
  const anh = screen.getByRole('button', { name: 'Anh' })
  expect(anh).toHaveAttribute('aria-pressed', 'true')
  expect(anh).toHaveFocus()
  await userEvent.keyboard('{Escape}')
  expect(await screen.findByRole('button', { name: 'Không phải bạn?' })).toHaveFocus()
})

test('a saved choice greets you on the next visit', async () => {
  localStorage.setItem('fair-share:me:7', '12')
  mockApi(house)
  renderApp('/households/7/members')
  expect(await screen.findByText('Minh', { selector: '.who-am-i b' })).toBeInTheDocument()
})

describe('invite links (#132)', () => {
  const key = 'f'.repeat(32)

  test('an invite link keeps its key, opens the household and leaves the address bar', async () => {
    const fetchFn = mockApi(house)
    renderApp(`/households/7#k=${key}`, { withoutKey: true })

    expect(await screen.findByRole('heading', { level: 1, name: 'Nhà trọ Q7' })).toBeInTheDocument()
    expect(keyFor(7)).toBe(key)
    const [, init] = fetchFn.mock.calls.find(([url]) => url === '/api/households/7') as unknown as [
      string,
      RequestInit,
    ]
    expect(new Headers(init.headers).get('X-Household-Key')).toBe(key)
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/households\/7$/)
  })

  test('without a key this browser asks for the invite link, and asks the API nothing', async () => {
    const fetchFn = mockApi(house)
    renderApp('/households/7/expenses', { withoutKey: true })

    expect(await screen.findByRole('heading', { level: 1, name: 'Cần đường dẫn mời' })).toBeInTheDocument()
    expect(screen.getByText(/Sao chép đường dẫn mời/)).toBeInTheDocument()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  test('a key that no longer opens it (deleted, or a wrong link) says so and is forgotten', async () => {
    mockApi({})
    renderApp(`/households/7#k=${key}`, { withoutKey: true })

    expect(await screen.findByRole('heading', { level: 1, name: 'Không tìm thấy nhà này' })).toBeInTheDocument()
    await waitFor(() => expect(keyFor(7)).toBeNull())
  })
})

