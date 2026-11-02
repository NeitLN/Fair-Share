import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { mockApi, renderApp } from './test/renderApp'

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
    ['/households/7/members', 'Thành viên'],
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
