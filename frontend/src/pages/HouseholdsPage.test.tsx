import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { keyFor, KNOWN_KEY, remember } from '../lib/knownHouseholds'
import { mockApi, renderApp, testKey } from '../test/renderApp'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const nha7 = { id: 7, name: 'Nhà 7', created_at: '2026-10-16T00:00:00Z' }
const nha9 = { id: 9, name: 'Nhà 9', created_at: '2026-10-18T00:00:00Z' }

/** This browser created or opened these households (with their keys), most recent first. */
const knows = (...ids: number[]) => [...ids].reverse().forEach((id) => remember(id, testKey(id)))
const known = () => JSON.parse(localStorage.getItem(KNOWN_KEY) ?? '[]')
const listCalls = (fetchFn: ReturnType<typeof mockApi>) =>
  fetchFn.mock.calls.filter(([url, init]) => url === '/api/households' && !init?.method)

test('lists only the households this browser knows, each loaded on its own', async () => {
  knows(9, 7)
  const fetchFn = mockApi({ 'GET /api/households/7': [200, nha7], 'GET /api/households/9': [200, nha9] })
  renderApp('/')

  expect(await screen.findByRole('link', { name: 'Nhà 7' })).toHaveAttribute('href', '/households/7')
  const names = screen.getAllByRole('link', { name: /^Nhà \d/ }).map((link) => link.textContent)
  expect(names).toEqual(['Nhà 9', 'Nhà 7'])
  // The list of every household is never asked for (#132)
  expect(listCalls(fetchFn)).toHaveLength(0)
})

test('another browser sees no household at all, and the create form is open', async () => {
  const fetchFn = mockApi({ 'GET /api/households/7': [200, nha7] })
  renderApp('/')

  expect(await screen.findByText(/Máy này chưa có nhà nào/)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Nhà 7' })).not.toBeInTheDocument()
  expect(screen.getByText('+ Tạo nhà mới').closest('details')).toHaveAttribute('open')
  expect(fetchFn).not.toHaveBeenCalled()
})

test('households saved before keys existed are not listed: they cannot be opened any more', async () => {
  localStorage.setItem(KNOWN_KEY, JSON.stringify([7]))
  localStorage.setItem('fair-share:me:7', '3')
  const fetchFn = mockApi({ 'GET /api/households/7': [200, nha7] })
  renderApp('/')

  expect(await screen.findByText(/Máy này chưa có nhà nào/)).toBeInTheDocument()
  expect(fetchFn).not.toHaveBeenCalled()
})

test('creating a household remembers it here and opens its members page', async () => {
  knows(7)
  const fetchFn = mockApi({
    'GET /api/households/7': [200, nha7],
    'POST /api/households': (body) => [
      201,
      { ...nha9, name: (body as { name: string }).name, key: testKey(9) },
    ],
    'GET /api/households/9': [200, nha9],
    'GET /api/households/9/members': [200, []],
  })
  const user = userEvent.setup()
  renderApp('/')

  await user.click(await screen.findByText('+ Tạo nhà mới'))
  await user.type(screen.getByLabelText('Tên nhà'), 'Nhà 9')
  await user.click(screen.getByRole('button', { name: 'Tạo nhà' }))

  expect(await screen.findByRole('heading', { level: 2, name: 'Thành viên' })).toBeInTheDocument()
  expect(fetchFn).toHaveBeenCalledWith('/api/households', expect.objectContaining({ method: 'POST' }))
  expect(known()).toEqual([9, 7])
  // The key came only with that answer, and is kept
  expect(keyFor(9)).toBe(testKey(9))
})

test('opening a household from an invite link adds it to this browser\'s list', async () => {
  mockApi({ 'GET /api/households/7': [200, nha7], 'GET /api/households/7/members': [200, []] })
  renderApp(`/households/7/members#k=${testKey(7)}`, { withoutKey: true })

  expect(await screen.findByRole('heading', { level: 1, name: 'Nhà 7' })).toBeInTheDocument()
  await waitFor(() => expect(known()).toEqual([7]))
})

test('a deleted household (404) leaves the list and is forgotten', async () => {
  knows(9, 7)
  mockApi({
    'GET /api/households/7': [200, nha7],
    'GET /api/households/9': [404, { error: { code: 'household_not_found', message: 'No such household' } }],
  })
  renderApp('/')

  expect(await screen.findByRole('link', { name: 'Nhà 7' })).toBeInTheDocument()
  await waitFor(() => expect(known()).toEqual([7]))
  expect(screen.queryByText(/Nhà #9/)).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('a household that could not be loaded stays, says why in Vietnamese, and Thử lại loads it', async () => {
  knows(7)
  let calls = 0
  mockApi({
    'GET /api/households/7': () => {
      calls += 1
      return calls === 1
        ? [503, { error: { code: 'database_unavailable', message: 'The database is not reachable' } }]
        : [200, nha7]
    },
  })
  const user = userEvent.setup()
  renderApp('/')

  expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ tạm thời không kết nối được dữ liệu.')
  expect(known()).toEqual([7])
  await user.click(screen.getByRole('button', { name: 'Thử lại' }))
  expect(await screen.findByRole('link', { name: 'Nhà 7' })).toBeInTheDocument()
})

test('Bỏ khỏi danh sách forgets it on this browser only, and Hoàn tác puts it back in place', async () => {
  knows(9, 7)
  const fetchFn = mockApi({ 'GET /api/households/7': [200, nha7], 'GET /api/households/9': [200, nha9] })
  const user = userEvent.setup()
  renderApp('/')

  await user.click(await screen.findByRole('button', { name: 'Bỏ Nhà 9 khỏi danh sách' }))

  expect(screen.queryByRole('link', { name: 'Nhà 9' })).not.toBeInTheDocument()
  expect(known()).toEqual([7])
  // Its key is gone from this browser too: opening it again needs the invite link
  expect(keyFor(9)).toBeNull()
  // Nothing was deleted on the server
  expect(fetchFn.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)

  const status = screen.getByRole('status', { name: '' })
  await user.click(within(status).getByRole('button', { name: 'Hoàn tác' }))
  expect(await screen.findByRole('link', { name: 'Nhà 9' })).toBeInTheDocument()
  expect(known()).toEqual([9, 7])
  expect(keyFor(9)).toBe(testKey(9))
})

test('shows the server message when creating fails, and keeps what was typed', async () => {
  mockApi({ 'POST /api/households': [422, { error: { code: 'invalid', message: 'Tên nhà quá dài' } }] })
  renderApp('/')

  await userEvent.type(await screen.findByLabelText('Tên nhà'), 'Nhà 7')
  await userEvent.click(screen.getByRole('button', { name: 'Tạo nhà' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Tên nhà quá dài')
  expect(screen.getByLabelText('Tên nhà')).toHaveValue('Nhà 7')
})

test('a failed create says why in Vietnamese, not the server\'s English', async () => {
  knows(7)
  mockApi({
    'GET /api/households/7': [200, nha7],
    'POST /api/households': [503, { error: { code: 'database_unavailable', message: 'The database is down' } }],
  })
  const user = userEvent.setup()
  renderApp('/')
  await user.click(await screen.findByText('+ Tạo nhà mới'))
  await user.type(screen.getByLabelText('Tên nhà'), 'Nhà 8')
  await user.click(screen.getByRole('button', { name: 'Tạo nhà' }))

  expect(await screen.findByText(/Máy chủ tạm thời không kết nối được dữ liệu/)).toBeInTheDocument()
  expect(screen.queryByText('The database is down')).not.toBeInTheDocument()
})

test('with households the list comes first and creating a new one is folded away', async () => {
  knows(7)
  mockApi({ 'GET /api/households/7': [200, nha7] })
  renderApp('/')
  await screen.findByRole('link', { name: 'Nhà 7' })
  const fold = screen.getByText('+ Tạo nhà mới').closest('details')
  expect(fold).not.toHaveAttribute('open')
  await userEvent.click(screen.getByText('+ Tạo nhà mới'))
  expect(fold).toHaveAttribute('open')
  expect(screen.getByLabelText('Tên nhà')).toBeVisible()
})

test('a failed create keeps the form open through the retry', async () => {
  knows(7)
  mockApi({
    'GET /api/households/7': [200, nha7],
    'POST /api/households': [503, { error: { code: 'database_unavailable', message: 'down' } }],
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

test('Escape closes "+ Tạo nhà mới" and focuses it again', async () => {
  knows(7)
  mockApi({ 'GET /api/households/7': [200, nha7] })
  renderApp('/')
  const user = userEvent.setup()
  await screen.findByRole('link', { name: 'Nhà 7' })
  const fold = screen.getByText('+ Tạo nhà mới').closest('details') as HTMLDetailsElement
  await user.click(screen.getByText('+ Tạo nhà mới'))
  await user.click(screen.getByLabelText('Tên nhà'))

  await user.keyboard('{Escape}')

  expect(fold.open).toBe(false)
  expect(screen.getByText('+ Tạo nhà mới')).toHaveFocus()
})

test('with no household yet, Escape leaves the create form open: it is the only thing to do', async () => {
  mockApi({})
  renderApp('/')
  const user = userEvent.setup()
  await user.click(await screen.findByLabelText('Tên nhà'))

  await user.keyboard('{Escape}')

  expect(screen.getByText('+ Tạo nhà mới').closest('details')).toHaveAttribute('open')
})
