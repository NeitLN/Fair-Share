import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { mockApi, renderApp } from '../test/renderApp'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const nha7 = { id: 7, name: 'Nhà 7', created_at: '2026-10-16T00:00:00Z', role: 'owner', member_id: 1 }
const nha9 = { id: 9, name: 'Nhà 9', created_at: '2026-10-18T00:00:00Z', role: 'member', member_id: 5 }
const mine = (households: object[] = [], pending: object[] = []): [number, unknown] => [
  200,
  { households, pending },
]
const listCalls = (fetchFn: ReturnType<typeof mockApi>) =>
  fetchFn.mock.calls.filter(([url, init]) => url === '/api/households' && !init?.method)

test("lists the account's own households, the ones it owns marked", async () => {
  mockApi({ 'GET /api/households': mine([nha7, nha9]) })
  renderApp('/')

  const owned = await screen.findByRole('link', { name: /^Nhà 7/ })
  expect(owned).toHaveAttribute('href', '/households/7')
  expect(within(owned).getByText('Trưởng nhóm')).toBeInTheDocument()
  expect(within(screen.getByRole('link', { name: /^Nhà 9/ })).queryByText('Trưởng nhóm')).not.toBeInTheDocument()
})

test('with no household yet, both ways in are open: join with a code, or create one', async () => {
  mockApi({ 'GET /api/households': mine() })
  renderApp('/')

  expect(await screen.findByText(/Bạn chưa ở nhà nào/)).toBeInTheDocument()
  expect(screen.getByText('+ Tạo nhà mới').closest('details')).toHaveAttribute('open')
  expect(screen.getByText('Nhập mã mời').closest('details')).toHaveAttribute('open')
})

test('creating a household opens its members page, to invite people', async () => {
  const fetchFn = mockApi({
    'GET /api/households': mine([nha7]),
    'POST /api/households': (body) => [201, { ...nha9, name: (body as { name: string }).name, role: 'owner' }],
    'GET /api/households/9': [200, { ...nha9, role: 'owner' }],
    'GET /api/households/9/members': [200, [{ id: 5, household_id: 9, name: 'Tiến', created_at: '', role: 'owner' }]],
    'GET /api/households/9/invite': [200, { code: 'K7QM2XRT', expires_at: '2026-11-09T00:00:00Z' }],
    'GET /api/households/9/requests': [200, []],
  })
  const user = userEvent.setup()
  renderApp('/')

  await user.click(await screen.findByText('+ Tạo nhà mới'))
  await user.type(screen.getByLabelText('Tên nhà'), 'Nhà 9')
  await user.click(screen.getByRole('button', { name: 'Tạo nhà' }))

  expect(await screen.findByRole('heading', { level: 2, name: 'Thành viên' })).toBeInTheDocument()
  // Its name is there at once, not "Đang tải…"
  expect(screen.getByRole('heading', { level: 1, name: 'Nhà 9' })).toBeInTheDocument()
  expect(await screen.findByText('K7QM-2XRT')).toBeInTheDocument()
  expect(fetchFn).toHaveBeenCalledWith('/api/households', expect.objectContaining({ method: 'POST' }))
})

test('a code asks to join and waits for the owner; the request shows without the household name', async () => {
  let asked = false
  const fetchFn = mockApi({
    'GET /api/households': () =>
      asked ? mine([], [{ household_id: 7, requested_at: '2026-11-02T08:00:00Z' }]) : mine(),
    'POST /api/join': () => {
      asked = true
      return [200, { status: 'pending', household_id: null }]
    },
  })
  const user = userEvent.setup()
  renderApp('/')

  await user.type(await screen.findByLabelText('Mã mời'), 'k7qm-2xrt')
  await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu vào nhà' }))

  expect(await screen.findByText(/Đã gửi yêu cầu/)).toBeInTheDocument()
  const join = fetchFn.mock.calls.find(([url]) => url === '/api/join')
  expect(JSON.parse(join?.[1]?.body as string)).toEqual({ code: 'k7qm-2xrt' })
  const waiting = await screen.findByRole('region', { name: 'Đang chờ duyệt' })
  expect(within(waiting).getByText(/đang chờ trưởng nhóm duyệt/)).toBeInTheDocument()
  expect(listCalls(fetchFn).length).toBeGreaterThan(1)
  // Done what they came for: the forms fold and the keyboard is taken to the wait
  expect(within(waiting).getByRole('heading', { name: 'Đang chờ duyệt' })).toHaveFocus()
  expect(screen.getByText('Nhập mã mời').closest('details')).not.toHaveAttribute('open')
  expect(screen.getByText('+ Tạo nhà mới').closest('details')).not.toHaveAttribute('open')
})

test('from an invite link too, sending the request folds the form that opened with the code', async () => {
  let asked = false
  mockApi({
    'GET /api/households': () =>
      asked ? mine([nha9], [{ household_id: 7, requested_at: '2026-11-02T08:00:00Z' }]) : mine([nha9]),
    'POST /api/join': () => {
      asked = true
      return [200, { status: 'pending', household_id: null }]
    },
  })
  const user = userEvent.setup()
  renderApp('/join/K7QM2XRT')

  expect(await screen.findByLabelText('Mã mời')).toHaveValue('K7QM2XRT')
  await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu vào nhà' }))

  expect(await screen.findByRole('heading', { name: 'Đang chờ duyệt' })).toHaveFocus()
  expect(screen.getByText('Nhập mã mời').closest('details')).not.toHaveAttribute('open')
})

test('while a request waits, the page is about the wait: no "no groups yet", both forms folded', async () => {
  mockApi({ 'GET /api/households': mine([], [{ household_id: 7, requested_at: '2026-11-02T08:00:00Z' }]) })
  renderApp('/')

  const waiting = await screen.findByRole('region', { name: 'Đang chờ duyệt' })
  expect(within(waiting).getByText(/Duyệt xong, nhà sẽ hiện ngay ở đây/)).toBeInTheDocument()
  expect(screen.queryByText(/Bạn chưa ở nhà nào/)).not.toBeInTheDocument()
  expect(screen.getByText('Nhập mã mời').closest('details')).not.toHaveAttribute('open')
  expect(screen.getByText('+ Tạo nhà mới').closest('details')).not.toHaveAttribute('open')
})

test('a wrong code says so in Vietnamese and keeps what was typed', async () => {
  mockApi({
    'GET /api/households': mine(),
    'POST /api/join': [404, { error: { code: 'invalid_code', message: 'This code is not right' } }],
  })
  const user = userEvent.setup()
  renderApp('/')

  await user.type(await screen.findByLabelText('Mã mời'), 'ZZZZZZZZ')
  await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu vào nhà' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Mã mời không đúng hoặc đã hết hạn')
  expect(screen.getByLabelText('Mã mời')).toHaveValue('ZZZZZZZZ')
})

test('a code that is not 8 characters is refused before reaching the API', async () => {
  const fetchFn = mockApi({ 'GET /api/households': mine() })
  const user = userEvent.setup()
  renderApp('/')

  await user.type(await screen.findByLabelText('Mã mời'), 'ABC')
  await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu vào nhà' }))

  expect(screen.getByRole('alert')).toHaveTextContent('Mã mời có 8 ký tự.')
  expect(fetchFn.mock.calls.some(([url]) => url === '/api/join')).toBe(false)
})

test('a member using the code again goes straight to the household', async () => {
  mockApi({
    'GET /api/households': mine([nha7]),
    'POST /api/join': [200, { status: 'member', household_id: 7 }],
    'GET /api/households/7': [200, nha7],
    'GET /api/households/7/members': [200, []],
    'GET /api/households/7/balances': [200, { balances: [], suggested: [] }],
    'GET /api/households/7/settlements': [200, []],
    'GET /api/households/7/expenses': [200, []],
  })
  const user = userEvent.setup()
  renderApp('/')

  await user.click(await screen.findByText('Nhập mã mời'))
  await user.type(screen.getByLabelText('Mã mời'), 'K7QM2XRT')
  await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu vào nhà' }))

  expect(await screen.findByRole('heading', { level: 1, name: 'Nhà 7' })).toBeInTheDocument()
})

test('an invite link /join/CODE fills the code in, ready to send', async () => {
  mockApi({ 'GET /api/households': mine([nha7]) })
  renderApp('/join/K7QM2XRT')

  expect(await screen.findByLabelText('Mã mời')).toHaveValue('K7QM2XRT')
  expect(screen.getByText('Nhập mã mời').closest('details')).toHaveAttribute('open')
})

test('a request still waiting can be cancelled', async () => {
  let waiting = true
  const fetchFn = mockApi({
    'GET /api/households': () =>
      mine([nha7], waiting ? [{ household_id: 12, requested_at: '2026-11-02T08:00:00Z' }] : []),
    'DELETE /api/me/requests/12': () => {
      waiting = false
      return [204]
    },
  })
  const user = userEvent.setup()
  renderApp('/')

  await user.click(await screen.findByRole('button', { name: 'Hủy yêu cầu' }))

  expect(await screen.findByText('Đã hủy yêu cầu vào nhà.')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Đang chờ duyệt' })).not.toBeInTheDocument()
  expect(fetchFn.mock.calls.some(([url, init]) => url === '/api/me/requests/12' && init?.method === 'DELETE')).toBe(
    true,
  )
})

test('a list that could not be loaded says why in Vietnamese, and Thử lại loads it', async () => {
  let calls = 0
  mockApi({
    'GET /api/households': () => {
      calls += 1
      return calls === 1
        ? [503, { error: { code: 'database_unavailable', message: 'The database is not reachable' } }]
        : mine([nha7])
    },
  })
  const user = userEvent.setup()
  renderApp('/')

  expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ tạm thời không kết nối được dữ liệu.')
  await user.click(screen.getByRole('button', { name: 'Thử lại' }))
  expect(await screen.findByRole('link', { name: /^Nhà 7/ })).toBeInTheDocument()
})

test('a failed create says why in Vietnamese and keeps the form open with what was typed', async () => {
  mockApi({
    'GET /api/households': mine([nha7]),
    'POST /api/households': [503, { error: { code: 'database_unavailable', message: 'The database is down' } }],
  })
  const user = userEvent.setup()
  renderApp('/')
  await user.click(await screen.findByText('+ Tạo nhà mới'))
  const fold = screen.getByText('+ Tạo nhà mới').closest('details')
  await user.type(screen.getByLabelText('Tên nhà'), 'Nhà 8')
  await user.click(screen.getByRole('button', { name: 'Tạo nhà' }))

  expect(await screen.findByText(/Máy chủ tạm thời không kết nối được dữ liệu/)).toBeInTheDocument()
  expect(screen.queryByText('The database is down')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Tạo nhà' }))
  expect(fold).toHaveAttribute('open')
  expect(screen.getByLabelText('Tên nhà')).toHaveValue('Nhà 8')
})

test('with households the list comes first and both folds start closed; Escape closes one again', async () => {
  mockApi({ 'GET /api/households': mine([nha7]) })
  renderApp('/')
  const user = userEvent.setup()
  await screen.findByRole('link', { name: /^Nhà 7/ })
  const fold = screen.getByText('+ Tạo nhà mới').closest('details') as HTMLDetailsElement
  expect(fold.open).toBe(false)
  expect(screen.getByText('Nhập mã mời').closest('details')).not.toHaveAttribute('open')
  await user.click(screen.getByText('+ Tạo nhà mới'))
  await user.click(screen.getByLabelText('Tên nhà'))

  await user.keyboard('{Escape}')

  expect(fold.open).toBe(false)
  expect(screen.getByText('+ Tạo nhà mới')).toHaveFocus()
})

test('with no household yet, Escape leaves the create form open: it is one of only two things to do', async () => {
  mockApi({ 'GET /api/households': mine() })
  renderApp('/')
  const user = userEvent.setup()
  await user.click(await screen.findByLabelText('Tên nhà'))

  await user.keyboard('{Escape}')

  expect(screen.getByText('+ Tạo nhà mới').closest('details')).toHaveAttribute('open')
})
