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

test('a failed create keeps the form open through the retry', async () => {
  let attempts = 0
  mockApi({
    'GET /api/households': [200, [nha7]],
    'POST /api/households': () =>
      ++attempts === 1
        ? [503, { error: { code: 'database_unavailable', message: 'down' } }]
        : [503, { error: { code: 'database_unavailable', message: 'still down' } }],
  })
  renderApp('/')
  await userEvent.click(await screen.findByText('+ Tạo nhà mới'))
  const fold = screen.getByText('+ Tạo nhà mới').closest('details')
  await userEvent.type(screen.getByLabelText('Tên nhà'), 'Nhà mới')
  await userEvent.click(screen.getByRole('button', { name: 'Tạo nhà' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Tạo nhà' }))
  expect(fold).toHaveAttribute('open')
  expect(screen.getByLabelText('Tên nhà')).toHaveValue('Nhà mới')
})

test('a failed load says so in Vietnamese, and Thử lại loads the list', async () => {
  let calls = 0
  mockApi({
    'GET /api/households': () => {
      calls += 1
      return calls === 1
        ? [503, { error: { code: 'database_unavailable', message: 'The database is not reachable' } }]
        : [200, [{ id: 7, name: 'Nhà 7', created_at: '2026-10-16T00:00:00Z' }]]
    },
  })
  const user = userEvent.setup()
  renderApp('/')

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Máy chủ tạm thời không kết nối được dữ liệu.',
  )
  await user.click(screen.getByRole('button', { name: 'Thử lại' }))
  expect(await screen.findByRole('link', { name: /Nhà 7/ })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('Escape closes "+ Tạo nhà mới" and focuses it again', async () => {
  mockApi({ 'GET /api/households': [200, [{ id: 7, name: 'Nhà 7', created_at: '' }]] })
  renderApp('/')
  const user = userEvent.setup()
  await screen.findByRole('link', { name: /Nhà 7/ })
  const fold = screen.getByText('+ Tạo nhà mới').closest('details') as HTMLDetailsElement
  await user.click(screen.getByText('+ Tạo nhà mới'))
  await user.click(screen.getByLabelText('Tên nhà'))

  await user.keyboard('{Escape}')

  expect(fold.open).toBe(false)
  expect(screen.getByText('+ Tạo nhà mới')).toHaveFocus()
})

test('with no household yet, Escape leaves the create form open: it is the only thing to do', async () => {
  mockApi({ 'GET /api/households': [200, []] })
  renderApp('/')
  const user = userEvent.setup()
  await user.click(await screen.findByLabelText('Tên nhà'))

  await user.keyboard('{Escape}')

  expect(screen.getByText('+ Tạo nhà mới').closest('details')).toHaveAttribute('open')
})

test('a failed create says why in Vietnamese, not the server\'s English', async () => {
  mockApi({
    'GET /api/households': [200, [{ id: 7, name: 'Nhà 7', created_at: '' }]],
    'POST /api/households': [503, { error: { code: 'database_unavailable', message: 'The database is down' } }],
  })
  renderApp('/')
  const user = userEvent.setup()
  await user.click(await screen.findByText('+ Tạo nhà mới'))
  await user.type(screen.getByLabelText('Tên nhà'), 'Nhà 8')
  await user.click(screen.getByRole('button', { name: 'Tạo nhà' }))

  expect(await screen.findByText(/Máy chủ tạm thời không kết nối được dữ liệu/)).toBeInTheDocument()
  expect(screen.queryByText('The database is down')).not.toBeInTheDocument()
})
