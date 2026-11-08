import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { request } from './api/client'
import { mockApi, renderApp } from './test/renderApp'
import { onAComputer } from './test/screen'

beforeEach(() => {
  mockApi({
    'GET /api/households': [200, { households: [], pending: [] }],
    'GET /api/households/7': [200, { id: 7, name: 'Nhà 7', created_at: '2026-10-16T00:00:00Z' }],
    'GET /api/households/7/members': [200, []],
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('routes', () => {
  test.each([
    ['/', 'Nhà của bạn'],
    ['/no-such-page', 'Không tìm thấy trang'],
  ])('%s shows "%s"', async (path, heading) => {
    renderApp(path)
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  // Inside a household the house name is the one h1; each page names itself in an h2 for screen
  // readers (the tabs already show it on screen)
  test.each([
    ['/households/7', 'Tổng quan'],
    ['/households/7/expenses', 'Chi tiêu'],
    // Thành viên titles its list on screen, with how many people there are
    ['/households/7/members', /^Thành viên · \d+$/],
  ])('%s is "%s" of Nhà 7, with one h1', async (path, page) => {
    renderApp(path)
    expect(await screen.findByRole('heading', { level: 2, name: page })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Nhà 7' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  test('household tabs link inside that household', async () => {
    renderApp('/households/7')
    expect(await screen.findByRole('link', { name: 'Chi tiêu' })).toHaveAttribute(
      'href',
      '/households/7/expenses',
    )
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page')
  })

  test('the theme switch forces light or dark and can go back to following the phone', async () => {
    renderApp('/')
    // It lives in the account menu, so the header stays one line on a phone
    await userEvent.click(await screen.findByLabelText(/^Tài khoản:/))
    const dark = await screen.findByRole('button', { name: 'Tối' })
    await userEvent.click(dark)
    expect(dark).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    await userEvent.click(screen.getByRole('button', { name: 'Tự động' }))
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  test('the header always links home', async () => {
    renderApp('/households/7/members')
    expect(await screen.findByRole('link', { name: 'Fair-Share' })).toHaveAttribute('href', '/')
  })
})

describe('accounts (docs/ACCOUNTS.md)', () => {
  const session = { token: 'new-token', user: { id: 3, email: 'minh@test.local', display_name: 'Minh' } }

  test('an invite link, signed out, says so and starts on Tạo tài khoản', async () => {
    mockApi({})
    renderApp('/join/K7QM2XRT', { signedOut: true })
    expect(await screen.findByText(/Bạn được mời vào một nhà/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: 'Vào nhà bạn được mời' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo tài khoản', pressed: true })).toBeInTheDocument()
    // Language and theme sit under the form while signed out
    expect(screen.getByRole('group', { name: 'Giao diện' })).toBeInTheDocument()
  })

  test('signed out, every address shows the sign-in form and asks the API nothing', async () => {
    const fetchFn = mockApi({})
    renderApp('/households/7', { signedOut: true })
    expect(await screen.findByRole('heading', { level: 1, name: 'Đăng nhập để vào nhà của bạn' })).toBeInTheDocument()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  test('creating an account signs in and opens the page that was asked for', async () => {
    const fetchFn = mockApi({
      'POST /api/auth/register': [201, session],
      'GET /api/households': [200, { households: [], pending: [] }],
    })
    const user = userEvent.setup()
    renderApp('/', { signedOut: true })

    await user.click(await screen.findByRole('button', { name: 'Tạo tài khoản' }))
    await user.type(screen.getByLabelText('Email'), 'minh@test.local')
    await user.type(screen.getByLabelText('Tên của bạn'), 'Minh')
    await user.type(screen.getByLabelText('Mật khẩu'), 'mat-khau-dai')
    await user.click(screen.getAllByRole('button', { name: 'Tạo tài khoản' })[1])

    expect(await screen.findByRole('heading', { level: 1, name: 'Nhà của bạn' })).toBeInTheDocument()
    const register = fetchFn.mock.calls.find(([url]) => url === '/api/auth/register')
    expect(JSON.parse(register?.[1]?.body as string)).toEqual({
      email: 'minh@test.local',
      password: 'mat-khau-dai',
      display_name: 'Minh',
    })
    // Every later request carries the new session
    const list = fetchFn.mock.calls.find(([url]) => url === '/api/households')
    expect(new Headers(list?.[1]?.headers).get('Authorization')).toBe('Bearer new-token')
  })

  test('a wrong password says so in Vietnamese and stays signed out', async () => {
    mockApi({
      'POST /api/auth/login': [401, { error: { code: 'invalid_credentials', message: 'nope' } }],
    })
    const user = userEvent.setup()
    renderApp('/', { signedOut: true })

    await user.type(await screen.findByLabelText('Email'), 'minh@test.local')
    await user.type(screen.getByLabelText('Mật khẩu'), 'sai-mat-khau')
    // The second "Đăng nhập": the first is the tab
    await user.click(screen.getAllByRole('button', { name: 'Đăng nhập' })[1])

    expect(await screen.findByRole('alert')).toHaveTextContent('Email hoặc mật khẩu chưa đúng.')
    expect(screen.getByRole('heading', { level: 1, name: 'Đăng nhập để vào nhà của bạn' })).toBeInTheDocument()
  })

  test('a password shorter than 8 characters is refused before reaching the API', async () => {
    const fetchFn = mockApi({})
    const user = userEvent.setup()
    renderApp('/', { signedOut: true })
    await user.click(await screen.findByRole('button', { name: 'Tạo tài khoản' }))
    await user.type(screen.getByLabelText('Email'), 'minh@test.local')
    await user.type(screen.getByLabelText('Tên của bạn'), 'Minh')
    await user.type(screen.getByLabelText('Mật khẩu'), 'ngan')
    await user.click(screen.getAllByRole('button', { name: 'Tạo tài khoản' })[1])

    expect(screen.getByRole('alert')).toHaveTextContent('Mật khẩu cần từ 8 đến 128 ký tự.')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  test('signing out ends the session on the server and shows the sign-in form', async () => {
    const fetchFn = mockApi({
      'GET /api/households': [200, { households: [], pending: [] }],
      'POST /api/auth/logout': [204],
    })
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await screen.findByLabelText('Tài khoản: Tiến'))
    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Đăng nhập để vào nhà của bạn' })).toBeInTheDocument()
    expect(fetchFn.mock.calls.some(([url]) => url === '/api/auth/logout')).toBe(true)
  })
})

// specs/008-wider-desktop-signin: signed out on a computer the wordmark is part of the sign-in block,
// so the header's small one is not shown; everywhere else the header stays
describe('the header around sign-in', () => {
  test('signed out on a computer, there is no header wordmark, only the one beside the form', async () => {
    onAComputer()
    const { container } = renderApp('/', { signedOut: true })

    expect(await screen.findByRole('heading', { level: 1, name: 'Đăng nhập để vào nhà của bạn' })).toBeInTheDocument()
    expect(container.querySelector('header.app-header')).toBeNull()
    expect(screen.getAllByRole('img', { name: 'Fair-Share' })).toHaveLength(1)
  })

  test('signed out on a phone, the header and its wordmark link are there', async () => {
    renderApp('/', { signedOut: true })

    expect(await screen.findByRole('link', { name: 'Fair-Share' })).toBeInTheDocument()
  })

  test('signed in on a computer, the header and its wordmark link are there', async () => {
    onAComputer()
    renderApp('/')

    expect(await screen.findByRole('link', { name: 'Fair-Share' })).toBeInTheDocument()
  })
})

// specs/011-first-impressions, US2: a sleeping server takes about 50 s to answer
describe('a slow answer', () => {
  const notice = 'Phản hồi đang lâu hơn bình thường. Máy chủ có thể đang khởi động, thường mất khoảng 1 phút. Bạn không cần tải lại trang.'
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('on the sign-in page: shown after 5 s, gone once the answer is read', async () => {
    let answer: (reply: [number, unknown]) => void = () => {}
    mockApi({ 'GET /api/held': () => new Promise((resolve) => (answer = resolve)) })
    renderApp('/', { signedOut: true })
    const pending = request('/api/held')
    act(() => vi.advanceTimersByTime(4_000))
    expect(screen.queryByText(notice)).toBeNull()
    act(() => vi.advanceTimersByTime(1_500))
    expect(screen.getByText(notice)).toBeInTheDocument()
    await act(async () => {
      answer([200, {}])
      await pending
    })
    expect(screen.queryByText(notice)).toBeNull()
  })

  test('in a house, read out once: moving to another page keeps the same notice', async () => {
    let answer: (reply: [number, unknown]) => void = () => {}
    mockApi({
      'GET /api/households': [200, { households: [], pending: [] }],
      'GET /api/households/7': [200, { id: 7, name: 'Nhà 7', created_at: '2026-10-16T00:00:00Z' }],
      'GET /api/households/7/members': [200, []],
      'GET /api/held': () => new Promise((resolve) => (answer = resolve)),
    })
    renderApp('/households/7')
    await screen.findByRole('heading', { level: 2, name: 'Tổng quan' })
    const pending = request('/api/held')
    act(() => vi.advanceTimersByTime(6_000))
    const shown = screen.getByText(notice)
    // In the live region: a new episode
    expect(shown.closest('[aria-live="polite"]')).not.toBeNull()
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('link', { name: 'Chi tiêu' }))
    await screen.findByRole('heading', { level: 2, name: 'Chi tiêu' })
    // The very same element: nothing new is put in the live region, so nothing is read again
    expect(screen.getByText(notice)).toBe(shown)
    await act(async () => {
      answer([200, {}])
      await pending
    })
    expect(screen.queryByText(notice)).toBeNull()
  })
})
