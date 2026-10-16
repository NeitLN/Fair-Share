import { screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { mockApi, renderApp } from '../test/renderApp'

afterEach(() => {
  vi.unstubAllGlobals()
})

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
