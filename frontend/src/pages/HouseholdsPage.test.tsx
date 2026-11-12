import { screen, waitFor, within } from '@testing-library/react'
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

test('with no household yet, one place to start: a greeting, then joining and creating side by side', async () => {
  mockApi({ 'GET /api/households': mine() })
  renderApp('/')

  // Design review 05/11: a grey line on the left and a lone code field on the right read as nothing to do
  const start = await screen.findByRole('region', { name: 'Chào Tiến, bắt đầu thôi' })
  expect(screen.queryByText(/Bạn chưa ở nhà nào/)).not.toBeInTheDocument()

  // Most people in a house join with a code, and they are told the owner approves it
  const join = within(start).getByRole('region', { name: 'Có mã mời?' })
  expect(within(join).getByText(/Trưởng nhóm duyệt xong/)).toBeInTheDocument()
  expect(within(join).getByLabelText('Mã mời')).toBeVisible()

  // The one who creates it sees the form at once, and what it makes them
  const create = within(start).getByRole('region', { name: 'Chưa ai tạo nhà?' })
  expect(within(create).getByText(/Bạn sẽ là trưởng nhóm/)).toBeInTheDocument()
  expect(within(create).getByLabelText('Tên nhà')).toBeVisible()
  expect(screen.queryByText('+ Tạo nhà mới')).not.toBeInTheDocument()
})

test('with no household yet, creating one takes no extra click and opens its members page', async () => {
  mockApi({
    'GET /api/households': mine(),
    'POST /api/households': (body) => [201, { ...nha9, name: (body as { name: string }).name, role: 'owner' }],
    'GET /api/households/9': [200, { ...nha9, role: 'owner' }],
    'GET /api/households/9/members': [200, [{ id: 5, household_id: 9, name: 'Tiến', created_at: '', role: 'owner' }]],
    'GET /api/households/9/invite': [200, { code: 'K7QM2XRT', expires_at: '2026-11-09T00:00:00Z' }],
    'GET /api/households/9/requests': [200, []],
  })
  const user = userEvent.setup()
  renderApp('/')

  await user.type(await screen.findByLabelText('Tên nhà'), 'Nhà 9')
  await user.click(screen.getByRole('button', { name: 'Tạo nhà' }))

  expect(await screen.findByRole('heading', { level: 1, name: 'Nhà 9' })).toBeInTheDocument()
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

  expect(await screen.findByRole('heading', { level: 2, name: 'Thành viên · 1' })).toBeInTheDocument()
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
  // The link is left behind: a later visit shows no code filled in (review 12/11, A04)
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/))
})

test('while a request waits, the page is about the wait: no "no groups yet", both forms folded', async () => {
  mockApi({ 'GET /api/households': mine([], [{ household_id: 7, requested_at: '2026-11-02T08:00:00Z' }]) })
  renderApp('/')

  const waiting = await screen.findByRole('region', { name: 'Đang chờ duyệt' })
  expect(within(waiting).getByText(/Duyệt xong, nhà sẽ hiện ở đây/)).toBeInTheDocument()
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

  await user.click(await screen.findByRole('button', { name: 'Huỷ yêu cầu' }))

  expect(await screen.findByText('Đã huỷ yêu cầu vào nhà.')).toBeInTheDocument()
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

test('the waiting card checks again on demand', async () => {
  const fetchFn = mockApi({ 'GET /api/households': mine([], [{ household_id: 7, requested_at: '2026-11-02T08:00:00Z' }]) })
  const user = userEvent.setup()
  renderApp('/')

  await user.click(await screen.findByRole('button', { name: 'Kiểm tra lại' }))
  // The light check of the person's requests (specs/015), not the whole house list again
  const checks = () => fetchFn.mock.calls.filter(([url]) => url === '/api/me/requests')
  await waitFor(() => expect(checks().length).toBeGreaterThan(1))
  // Waiting to join, the tips for people who invite others are not shown
  expect(screen.queryByText(/Mời bạn cùng phòng bằng mã mời/)).not.toBeInTheDocument()
})

// --- specs/015-invite-preview -------------------------------------------------------------------

const waitingQ7 = { household_id: 12, requested_at: '2026-11-08T08:00:00Z', household_name: 'Nhà trọ Q7', owner_name: 'Tiến' }
const requests = (pending: object[] = [], joined: number[] = [], outcomes: object[] = []): [number, unknown] => [
  200,
  { pending, joined, outcomes },
]

test('an invite link shows the house before asking, and the create form waits behind a link', async () => {
  mockApi({
    'GET /api/households': mine(),
    'GET /api/me/requests': requests(),
    'POST /api/invites/preview': [200, { house_name: 'Nhà trọ Q7', owner_name: 'Tiến', member: false, household_id: null }],
  })
  const user = userEvent.setup()
  renderApp('/join/K7QM2XRT')

  expect(await screen.findByText('Lời mời vào Nhà trọ Q7 của Tiến')).toBeInTheDocument()
  expect(screen.getByLabelText('Mã mời')).toHaveAccessibleDescription(/Lời mời vào Nhà trọ Q7 của Tiến/)
  // No second, empty house by mistake
  expect(screen.queryByRole('region', { name: 'Chưa ai tạo nhà?' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Tạo nhà khác' }))
  expect(screen.getByRole('region', { name: 'Chưa ai tạo nhà?' })).toBeInTheDocument()
})

test('a wrong code says nothing while typing', async () => {
  const fetchFn = mockApi({
    'GET /api/households': mine(),
    'GET /api/me/requests': requests(),
    'POST /api/invites/preview': [404, { error: { code: 'invalid_code', message: 'This code is not right or has expired' } }],
  })
  const user = userEvent.setup()
  renderApp('/')
  await user.type(await screen.findByLabelText('Mã mời'), 'zzzz-zzzz')
  await waitFor(() => expect(fetchFn.mock.calls.some(([url]) => url === '/api/invites/preview')).toBe(true))
  expect(screen.queryByText(/not right/)).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  // The create form is there: no valid invite
  expect(screen.getByRole('region', { name: 'Chưa ai tạo nhà?' })).toBeInTheDocument()
})

test('a waiting card names the house and its owner, and its cancel names the house', async () => {
  mockApi({ 'GET /api/households': mine([], [waitingQ7]), 'GET /api/me/requests': requests([waitingQ7]) })
  renderApp('/')
  expect(await screen.findByText(/^Bạn đang xin vào Nhà trọ Q7 của Tiến · gửi ngày/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Huỷ yêu cầu vào Nhà trọ Q7' })).toBeInTheDocument()
})

test('approved while waiting: the house shows and "Bạn đã vào" says so', async () => {
  let approved = false
  mockApi({
    'GET /api/households': () => (approved ? mine([{ ...nha7, id: 12, name: 'Nhà trọ Q7', role: 'member' }]) : mine([], [waitingQ7])),
    'GET /api/me/requests': () => (approved ? requests([], [12]) : requests([waitingQ7])),
  })
  const user = userEvent.setup()
  renderApp('/')
  await screen.findByText(/^Bạn đang xin vào Nhà trọ Q7/)
  approved = true
  await user.click(screen.getByRole('button', { name: 'Kiểm tra lại' }))
  expect(await screen.findByText('Bạn đã vào Nhà trọ Q7.')).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: /^Nhà trọ Q7/ })).toBeInTheDocument()
})

test('a refusal stays as a line until "Đã hiểu", and the create form is back', async () => {
  let outcomes = [{ id: 41, household_id: 12, household_name: 'Nhà trọ Q7', owner_name: 'Tiến', kind: 'refused', happened_at: '' }]
  const fetchFn = mockApi({
    'GET /api/households': mine(),
    'GET /api/me/requests': () => requests([], [], outcomes),
    'DELETE /api/me/outcomes/41': () => {
      outcomes = []
      return [204]
    },
  })
  const user = userEvent.setup()
  renderApp('/')
  expect(await screen.findByText('Tiến không duyệt yêu cầu vào Nhà trọ Q7 của bạn.')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Chưa ai tạo nhà?' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Đã hiểu' }))
  await waitFor(() => expect(screen.queryByText(/không duyệt/)).not.toBeInTheDocument())
  expect(fetchFn.mock.calls.some(([url, init]) => url === '/api/me/outcomes/41' && init?.method === 'DELETE')).toBe(true)
})

test('a house deleted while waiting says so', async () => {
  mockApi({
    'GET /api/households': mine(),
    'GET /api/me/requests': requests([], [], [
      { id: 42, household_id: 12, household_name: 'Nhà trọ Q7', owner_name: 'Tiến', kind: 'house_deleted', happened_at: '' },
    ]),
  })
  renderApp('/')
  expect(await screen.findByText('Nhà trọ Q7 không còn nữa, yêu cầu của bạn đã dừng.')).toBeInTheDocument()
})

test('sending a request shows its waiting card at once, from the person\'s requests', async () => {
  let asked = false
  mockApi({
    'GET /api/households': () => (asked ? mine([], [waitingQ7]) : mine()),
    'GET /api/me/requests': () => (asked ? requests([waitingQ7]) : requests()),
    'POST /api/invites/preview': [200, { house_name: 'Nhà trọ Q7', owner_name: 'Tiến', member: false, household_id: null }],
    'POST /api/join': () => {
      asked = true
      return [200, { status: 'pending', household_id: null }]
    },
  })
  const user = userEvent.setup()
  renderApp('/join/K7QM2XRT')
  await screen.findByText('Lời mời vào Nhà trọ Q7 của Tiến')
  await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu vào nhà' }))
  expect(await screen.findByText(/^Bạn đang xin vào Nhà trọ Q7 của Tiến · gửi ngày/)).toBeInTheDocument()
})

// --- specs/017-houses-profile-redesign ----------------------------------------------------------

test('with a house the two help paragraphs are gone, a new account still reads how it works, and the tab is named', async () => {
  mockApi({ 'GET /api/households': mine([nha7]) })
  const { unmount } = renderApp('/')
  await screen.findByRole('link', { name: /^Nhà 7/ })
  expect(screen.queryByText(/^Ghi khoản chi khi vừa trả tiền/)).not.toBeInTheDocument()
  // The invite line lives only inside the create fold now (FR-008)
  expect(screen.getByText(/mời bạn cùng nhà bằng mã mời ở trang Thành viên/).closest('details')).toHaveClass('create-household')
  expect(document.title).toBe('Nhà của bạn · Fair-Share')
  unmount()

  mockApi({ 'GET /api/households': mine() })
  renderApp('/')
  expect(await screen.findByText(/^Ghi khoản chi khi vừa trả tiền/)).toBeInTheDocument()
})

test('the ways in sit in Thêm nhà, after the houses and the wait', async () => {
  mockApi({ 'GET /api/households': mine([nha7], [{ household_id: 12, requested_at: '2026-11-02T08:00:00Z' }]) })
  renderApp('/')
  const list = await screen.findByRole('link', { name: /^Nhà 7/ })
  const waiting = screen.getByRole('region', { name: 'Đang chờ duyệt' })
  const add = screen.getByRole('region', { name: 'Thêm nhà' })
  expect(within(add).getByText('Nhập mã mời').closest('details')).toBeInTheDocument()
  expect(within(add).getByText('+ Tạo nhà mới').closest('details')).toBeInTheDocument()
  // DOM order is the keyboard order: houses, the wait, then the ways in
  expect(list.compareDocumentPosition(waiting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(waiting.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('opening a fold takes the keyboard to its field, and the create fold says how to invite', async () => {
  mockApi({ 'GET /api/households': mine([nha7]) })
  const user = userEvent.setup()
  renderApp('/')
  await screen.findByRole('link', { name: /^Nhà 7/ })

  await user.click(screen.getByText('Nhập mã mời'))
  await waitFor(() => expect(screen.getByLabelText('Mã mời')).toHaveFocus())

  await user.click(screen.getByText('+ Tạo nhà mới'))
  await waitFor(() => expect(screen.getByLabelText('Tên nhà')).toHaveFocus())
  expect(screen.getByLabelText('Tên nhà')).toHaveAccessibleDescription(/mời bạn cùng nhà bằng mã mời ở trang Thành viên/)
})

test('an invite link while in a house puts the keyboard in the code', async () => {
  mockApi({ 'GET /api/households': mine([nha7]) })
  renderApp('/join/K7QM2XRT')
  const field = await screen.findByLabelText('Mã mời')
  await waitFor(() => expect(field).toHaveFocus())
  expect(field).toHaveValue('K7QM2XRT')
})

test('a problem with the code or the name is read with its field', async () => {
  mockApi({ 'GET /api/households': mine([nha7]) })
  const user = userEvent.setup()
  renderApp('/')
  await screen.findByRole('link', { name: /^Nhà 7/ })

  await user.click(screen.getByText('Nhập mã mời'))
  await user.type(screen.getByLabelText('Mã mời'), 'ABC')
  await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu vào nhà' }))
  expect(screen.getByLabelText('Mã mời')).toHaveAccessibleDescription(/Mã mời có 8 ký tự\./)

  await user.click(screen.getByText('+ Tạo nhà mới'))
  await user.click(screen.getByRole('button', { name: 'Tạo nhà' }))
  expect(screen.getByLabelText('Tên nhà')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('Tên nhà')).toHaveAccessibleDescription(/Nhập tên nhà\./)
})

// Review 12/11, A06: what the server said about the last code goes once the code changes
test('a changed code drops the old answer about the last one', async () => {
  mockApi({
    'GET /api/households': mine(),
    'POST /api/join': [404, { error: { code: 'invite_not_found', message: 'no' } }],
  })
  const user = userEvent.setup()
  renderApp('/')
  const field = await screen.findByLabelText('Mã mời')
  await user.type(field, 'k7qm-2xrt')
  await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu vào nhà' }))
  const old = await screen.findByRole('alert')
  await user.type(field, 'x')
  expect(old).not.toBeInTheDocument()
})