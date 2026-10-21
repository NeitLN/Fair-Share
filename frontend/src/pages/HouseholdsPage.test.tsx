import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { mockApi, renderApp } from '../test/renderApp'

afterEach(() => {
  vi.unstubAllGlobals()
})

const nha7 = { id: 7, name: 'Nhà 7', created_at: '2026-10-16T00:00:00Z' }

test('lists the households from the API', async () => {
  mockApi({ 'GET /api/households': [200, [nha7]] })
  renderApp('/')
  expect(await screen.findByRole('link', { name: 'Nhà 7' })).toHaveAttribute('href', '/households/7')
})

test('creating a household opens its members page', async () => {
  const fetchFn = mockApi({
    'GET /api/households': [200, []],
    'POST /api/households': (body) => [201, { ...nha7, name: (body as { name: string }).name }],
    'GET /api/households/7': [200, nha7],
    'GET /api/households/7/members': [200, []],
  })
  renderApp('/')

  await userEvent.type(await screen.findByLabelText('Tên nhà'), 'Nhà 7')
  await userEvent.click(screen.getByRole('button', { name: 'Tạo nhà' }))

  expect(await screen.findByRole('heading', { level: 2, name: 'Thành viên' })).toBeInTheDocument()
  expect(fetchFn).toHaveBeenCalledWith('/api/households', expect.objectContaining({ method: 'POST' }))
})

test('shows the server message when creating fails', async () => {
  mockApi({
    'GET /api/households': [200, []],
    'POST /api/households': [422, { error: { code: 'invalid', message: 'Tên nhà quá dài' } }],
  })
  renderApp('/')

  await userEvent.type(await screen.findByLabelText('Tên nhà'), 'Nhà 7')
  await userEvent.click(screen.getByRole('button', { name: 'Tạo nhà' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Tên nhà quá dài')
  expect(screen.getByLabelText('Tên nhà')).toHaveValue('Nhà 7')
})

test('says so when the API cannot be reached', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
  renderApp('/')
  expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được tới máy chủ')
})

test('with households the list comes first and creating a new one is folded away', async () => {
  mockApi({ 'GET /api/households': [200, [nha7]] })
  renderApp('/')
  await screen.findByRole('link', { name: 'Nhà 7' })
  const fold = screen.getByText('+ Tạo nhà mới').closest('details')
  expect(fold).not.toHaveAttribute('open')
  await userEvent.click(screen.getByText('+ Tạo nhà mới'))
  expect(fold).toHaveAttribute('open')
  expect(screen.getByLabelText('Tên nhà')).toBeVisible()
})

test('with no household yet the form is already open', async () => {
  mockApi({ 'GET /api/households': [200, []] })
  renderApp('/')
  expect(await screen.findByText(/Chưa có nhà nào/)).toBeInTheDocument()
  expect(screen.getByText('+ Tạo nhà mới').closest('details')).toHaveAttribute('open')
})
