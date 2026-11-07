import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { currentSession, updateUser } from '../lib/session'
import { mockApi, renderApp, testUser } from '../test/renderApp'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const noHouses: Record<string, [number, unknown]> = {
  'GET /api/households': [200, { households: [], pending: [] }],
}

test('the account menu opens the profile page, which shows the email as it is', async () => {
  mockApi({ ...noHouses })
  const user = userEvent.setup()
  renderApp('/')
  await user.click(screen.getByLabelText('Tài khoản: Tiến'))
  await user.click(screen.getByRole('link', { name: 'Hồ sơ của bạn' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Hồ sơ của bạn' })).toBeInTheDocument()
  expect(screen.getByText(testUser.email, { selector: 'strong' })).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument()
})

test('a signed-out visitor sees the sign-in form instead', () => {
  mockApi({})
  renderApp('/account', { signedOut: true })
  expect(screen.queryByRole('heading', { name: 'Hồ sơ của bạn' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Mật khẩu')).toBeInTheDocument()
})

test('a new name is saved everywhere, and the account in the header follows it', async () => {
  const api = mockApi({
    ...noHouses,
    'PATCH /api/me': [200, { user: { ...testUser, display_name: 'Việt Tiến' }, kept: [] }],
  })
  const user = userEvent.setup()
  renderApp('/account')
  const field = screen.getByLabelText('Tên hiển thị')
  await user.clear(field)
  await user.type(field, '  Việt Tiến ')
  await user.click(screen.getAllByRole('button', { name: 'Lưu' })[0])
  expect(await screen.findByText('Đã đổi tên ở mọi nhà.')).toBeInTheDocument()
  const sent = api.mock.calls.find(([url, init]) => url === '/api/me' && init?.method === 'PATCH')
  expect(JSON.parse(String(sent?.[1]?.body))).toEqual({ display_name: 'Việt Tiến' })
  expect(currentSession()?.user.display_name).toBe('Việt Tiến')
  expect(screen.getByLabelText('Tài khoản: Việt Tiến')).toBeInTheDocument()
})

test('a household where the name is taken is named, with the name kept there', async () => {
  mockApi({
    ...noHouses,
    'PATCH /api/me': [
      200,
      {
        user: { ...testUser, display_name: 'Lan' },
        kept: [{ household_id: 3, household_name: 'Nhà B', name: 'Tiến' }],
      },
    ],
  })
  const user = userEvent.setup()
  renderApp('/account')
  const field = screen.getByLabelText('Tên hiển thị')
  await user.clear(field)
  await user.type(field, 'Lan')
  await user.click(screen.getAllByRole('button', { name: 'Lưu' })[0])
  expect(
    await screen.findByText('Ở Nhà B đã có người tên Lan, nên ở đó bạn vẫn là Tiến.'),
  ).toBeInTheDocument()
})

test('an empty or too long name is refused next to the field, and what was typed stays', async () => {
  const api = mockApi({ ...noHouses })
  const user = userEvent.setup()
  renderApp('/account')
  const field = screen.getByLabelText('Tên hiển thị')
  await user.clear(field)
  await user.type(field, '   ')
  await user.click(screen.getAllByRole('button', { name: 'Lưu' })[0])
  expect(screen.getByText('Tên dài 1 đến 40 ký tự.')).toBeInTheDocument()
  expect(field).toHaveAttribute('aria-invalid', 'true')
  await user.type(field, 'x'.repeat(41))
  await user.click(screen.getAllByRole('button', { name: 'Lưu' })[0])
  expect(screen.getByText('Tên dài 1 đến 40 ký tự.')).toBeInTheDocument()
  expect(field).toHaveValue(`   ${'x'.repeat(41)}`)
  expect(api.mock.calls.some(([url]) => url === '/api/me')).toBe(false)
})

test('a wrong current password is said under its field, and nobody is signed out', async () => {
  mockApi({
    ...noHouses,
    'POST /api/me/password': [400, { error: { code: 'wrong_password', message: 'no' } }],
  })
  const user = userEvent.setup()
  renderApp('/account')
  await user.type(screen.getByLabelText('Mật khẩu hiện tại'), 'sai-mat-khau')
  await user.type(screen.getByLabelText('Mật khẩu mới'), 'mat-khau-moi-1')
  await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))
  expect(await screen.findByText('Mật khẩu hiện tại chưa đúng.')).toBeInTheDocument()
  expect(currentSession()).not.toBeNull()
  expect(screen.getByLabelText('Mật khẩu hiện tại')).toHaveValue('')
})

test('too many tries says to wait, as signing in does', async () => {
  mockApi({
    ...noHouses,
    'POST /api/me/password': [429, { error: { code: 'too_many_attempts', message: 'wait' } }],
  })
  const user = userEvent.setup()
  renderApp('/account')
  await user.type(screen.getByLabelText('Mật khẩu hiện tại'), 'sai-mat-khau')
  await user.type(screen.getByLabelText('Mật khẩu mới'), 'mat-khau-moi-1')
  await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))
  expect(await screen.findByText('Bạn thử quá nhiều lần. Đợi một lúc rồi thử lại.')).toBeInTheDocument()
})

test('a changed password says the other places are signed out and clears both fields', async () => {
  const api = mockApi({ ...noHouses, 'POST /api/me/password': [204] })
  const user = userEvent.setup()
  renderApp('/account')
  await user.type(screen.getByLabelText('Mật khẩu hiện tại'), 'mat-khau-cu')
  await user.type(screen.getByLabelText('Mật khẩu mới'), 'mat-khau-moi-1')
  await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))
  expect(await screen.findByText('Đã đổi mật khẩu. Các nơi khác đã đăng xuất.')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText('Mật khẩu mới')).toHaveValue(''))
  const sent = api.mock.calls.find(([url]) => url === '/api/me/password')
  expect(JSON.parse(String(sent?.[1]?.body))).toEqual({
    current_password: 'mat-khau-cu',
    new_password: 'mat-khau-moi-1',
  })
})

test('a new password of the wrong length is refused before anything is sent', async () => {
  const api = mockApi({ ...noHouses })
  const user = userEvent.setup()
  renderApp('/account')
  await user.type(screen.getByLabelText('Mật khẩu hiện tại'), 'mat-khau-cu')
  await user.type(screen.getByLabelText('Mật khẩu mới'), 'ngan')
  await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))
  expect(screen.getByText('Mật khẩu mới dài 8 đến 128 ký tự.')).toBeInTheDocument()
  expect(api.mock.calls.some(([url]) => url === '/api/me/password')).toBe(false)
})

// --- Status (specs/010-profile-page, US3) ---

test('a status is saved, and the counter counts an emoji once', async () => {
  const api = mockApi({
    ...noHouses,
    'PUT /api/me/status': (body) => [200, { ...testUser, status: (body as { status: string }).status }],
  })
  const user = userEvent.setup()
  renderApp('/account')
  const field = screen.getByLabelText('Trạng thái bạn cùng nhà thấy')
  await user.type(field, 'ăn kiêng 🥗')
  expect(screen.getByText(/^10\/60 ký tự/)).toBeInTheDocument()
  await user.click(screen.getAllByRole('button', { name: 'Lưu' })[1])
  expect(await screen.findByText('Đã lưu trạng thái.')).toBeInTheDocument()
  const sent = api.mock.calls.find(([url]) => url === '/api/me/status')
  expect(JSON.parse(String(sent?.[1]?.body))).toEqual({ status: 'ăn kiêng 🥗' })
  expect(currentSession()?.user.status).toBe('ăn kiêng 🥗')
})

test('Xoá trạng thái clears it, and an empty field saves no status', async () => {
  const api = mockApi({ ...noHouses, 'PUT /api/me/status': [200, { ...testUser, status: null }] })
  const user = userEvent.setup()
  renderApp('/account')
  act(() => updateUser({ ...testUser, status: 'đang ăn kiêng' }))
  await user.click(screen.getByRole('button', { name: 'Xoá trạng thái' }))
  expect(await screen.findByText('Đã xoá trạng thái.')).toBeInTheDocument()
  const sent = api.mock.calls.find(([url]) => url === '/api/me/status')
  expect(JSON.parse(String(sent?.[1]?.body))).toEqual({ status: null })
})

test('more than 60 characters is refused next to the field before anything is sent', async () => {
  const api = mockApi({ ...noHouses })
  const user = userEvent.setup()
  renderApp('/account')
  await user.type(screen.getByLabelText('Trạng thái bạn cùng nhà thấy'), 'a'.repeat(61))
  await user.click(screen.getAllByRole('button', { name: 'Lưu' })[1])
  expect(screen.getByText('Trạng thái dài tối đa 60 ký tự, trên một dòng.')).toBeInTheDocument()
  expect(api.mock.calls.some(([url]) => url === '/api/me/status')).toBe(false)
})
