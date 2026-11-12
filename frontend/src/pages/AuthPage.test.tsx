import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { renderApp } from '../test/renderApp'
import { onAComputer } from '../test/screen'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

// Found in the review of #166: a 401 signed out without clearing what was loaded, so on a shared
// device the next account saw the last one's groups until its own answers arrived
test("after a session expires, the next person on this device never sees the last one's groups", async () => {
  let signedInAs = 'An'
  const group = { id: 7, name: 'Nhà của An', created_at: '', role: 'owner', member_id: 1 }
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      const path = new URL(url, 'http://x').pathname
      const method = init.method ?? 'GET'
      if (method === 'POST' && path === '/api/auth/login') {
        signedInAs = 'Bình'
        return json(200, { token: 'binh-token', user: { id: 2, email: 'binh@test.local', display_name: 'Bình' } })
      }
      if (signedInAs === 'An') {
        if (path === '/api/households') return json(200, { households: [group], pending: [] })
        if (path === '/api/me/requests') return json(200, { pending: [], joined: [7], outcomes: [] })
        // The header's own avatar (specs/017, US5) loads before the house is opened
        if (path === '/api/me/photo') return json(200, { version: null, data: null })
        // An's session has expired on the server
        return json(401, { error: { code: 'not_authenticated', message: 'Sign in to continue' } })
      }
      // Bình: every answer is still on its way (a slow phone network)
      return new Promise<Response>(() => {})
    }),
  )
  const user = userEvent.setup()
  const { client } = renderApp('/')
  await user.click(await screen.findByRole('link', { name: /Nhà của An/ }))

  await user.type(await screen.findByLabelText('Email'), 'binh@test.local')
  await user.type(screen.getByLabelText('Mật khẩu'), 'binh-password')
  const buttons = screen.getAllByRole('button', { name: 'Đăng nhập' })
  await user.click(buttons[buttons.length - 1])
  await waitFor(() => expect(screen.queryByLabelText('Mật khẩu')).not.toBeInTheDocument())

  const cached = JSON.stringify(client.getQueryData(['households']) ?? null)
  const onTheGroupPage = document.body.textContent ?? ''
  await user.click(screen.getAllByRole('link')[0])
  const onHome = document.body.textContent ?? ''
  expect({
    cacheHasAn: cached.includes('Nhà của An'),
    groupPageShowsAn: onTheGroupPage.includes('Nhà của An'),
    homeShowsAn: onHome.includes('Nhà của An'),
  }).toEqual({ cacheHasAn: false, groupPageShowsAn: false, homeShowsAn: false })
})

test('the title says what the form does: sign in, or create an account', async () => {
  const user = userEvent.setup()
  renderApp('/', { signedOut: true })

  expect(await screen.findByRole('heading', { level: 1, name: 'Đăng nhập để vào nhà của bạn' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Tạo tài khoản mới' })).toBeInTheDocument()
})

// specs/012-overview-and-lists, FR-020: an empty name is named, and the hint steps aside while the
// problem shows (only one line under the field, the problem)
test('an empty sign-up name is named, and its hint steps aside', async () => {
  const user = userEvent.setup()
  renderApp('/', { signedOut: true })

  await user.click(await screen.findByRole('button', { name: 'Tạo tài khoản' }))
  await user.type(screen.getByLabelText('Email'), 'minh@example.com')
  await user.type(screen.getByLabelText('Mật khẩu'), 'minh-password')
  expect(screen.getByText(/Tên này hiện trong phần chia tiền/)).toBeInTheDocument()

  const submits = screen.getAllByRole('button', { name: 'Tạo tài khoản' })
  await user.click(submits[submits.length - 1])

  expect(screen.getByRole('alert')).toHaveTextContent('Nhập tên của bạn.')
  expect(screen.queryByText(/Tên này hiện trong phần chia tiền/)).not.toBeInTheDocument()
  expect(screen.getByLabelText('Tên của bạn')).toHaveAttribute('aria-describedby', 'auth-name-problem')
})

// specs/008-wider-desktop-signin: on a computer the page is one block, the brand on the left and the
// form with its switches on the right; on a phone it is the form as before
const INTRO = 'Ghi chi tiêu chung với bạn cùng phòng và thấy rõ ai cần trả ai, trên mọi thiết bị.'

const follows = (later: Element, earlier: Element) =>
  Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING)

test('on a computer the brand sits beside the form: tagline, intro once, decorative avatars', async () => {
  onAComputer()
  const { container } = renderApp('/', { signedOut: true })

  expect(await screen.findByText('Rõ ai trả ai.')).toBeInTheDocument()
  // The intro moves beside the form, so a screen reader hears it once
  expect(screen.getAllByText(INTRO)).toHaveLength(1)
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1, name: 'Đăng nhập để vào nhà của bạn' })).toBeInTheDocument()
  // The wordmark keeps its name; the four sample avatars are decoration only
  expect(screen.getByRole('img', { name: 'Fair-Share' })).toBeInTheDocument()
  const avatars = container.querySelectorAll('.auth-intro .avatar')
  expect(avatars).toHaveLength(4)
  for (const avatar of avatars) expect(avatar.closest('[aria-hidden="true"]')).not.toBeNull()
  // Read and tabbed in the order seen: the form, then the language, then the theme
  const submit = screen.getAllByRole('button', { name: 'Đăng nhập' }).at(-1)!
  const language = screen.getByRole('group', { name: 'Ngôn ngữ' })
  const theme = screen.getByRole('group', { name: 'Giao diện' })
  expect(follows(language, submit) && follows(theme, language)).toBe(true)
})

test('on a phone the sign-in page is the form with its intro, as before', async () => {
  const { container } = renderApp('/', { signedOut: true })

  expect(await screen.findByText(INTRO)).toBeInTheDocument()
  expect(screen.queryByText('Rõ ai trả ai.')).not.toBeInTheDocument()
  expect(container.querySelector('.auth-intro')).toBeNull()
  expect(screen.getByRole('group', { name: 'Ngôn ngữ' })).toBeInTheDocument()
})

test('an invite link keeps its note in the form on a computer', async () => {
  onAComputer()
  renderApp('/join/ABCDEFGH', { signedOut: true })

  expect(await screen.findByRole('heading', { level: 1, name: 'Vào nhà bạn được mời' })).toBeInTheDocument()
  const note = screen.getByText(/Bạn được mời vào một nhà/)
  expect(note.closest('.auth')).not.toBeNull()
})

// Sign-in review of 07/11: the password can be shown to check it, and hidden again
test('Hiện shows the password and Ẩn hides it again, on a phone and on a computer', async () => {
  const user = userEvent.setup()
  renderApp('/', { signedOut: true })

  const field = await screen.findByLabelText('Mật khẩu')
  expect(field).toHaveAttribute('type', 'password')
  await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
  expect(field).toHaveAttribute('type', 'text')
  await user.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }))
  expect(field).toHaveAttribute('type', 'password')
})

test('on a computer the stickers carry a line that says what they stand for', async () => {
  onAComputer()
  renderApp('/', { signedOut: true })

  expect(await screen.findByText('Một nhà, nhiều người. Chi tiêu vẫn rõ ràng.')).toBeInTheDocument()
})

// Review 12/11, E10/F16: a session the server stopped accepting signs out and says so on the sign-in page
test('a session that ended says so on the sign-in page', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => json(401, { error: { code: 'not_signed_in', message: 'no' } })),
  )
  renderApp('/')
  expect(await screen.findByText(/^Phiên đăng nhập đã kết thúc/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Đăng nhập')
})

test('another tab signing out signs this one out too, and says why', async () => {
  vi.stubGlobal('fetch', vi.fn(() => json(200, { households: [], pending: [] })))
  renderApp('/')
  await screen.findByRole('heading', { level: 1 })
  // What another tab does: the stored session goes, and this tab hears it
  localStorage.removeItem('fair-share:session')
  window.dispatchEvent(new StorageEvent('storage', { key: 'fair-share:session', newValue: null }))
  expect(await screen.findByText(/^Phiên đăng nhập đã kết thúc/)).toBeInTheDocument()
})

// Review 12/11, A09: an empty password says to enter one, not the length rule
test('an empty password on sign-in asks for it', async () => {
  vi.stubGlobal('fetch', vi.fn(() => json(200, {})))
  const user = userEvent.setup()
  renderApp('/', { signedOut: true })
  const email = await screen.findByLabelText('Email')
  await user.type(email, 'an@test.local')
  await user.click(within(email.closest('form') as HTMLElement).getByRole('button', { name: 'Đăng nhập' }))
  expect(screen.getByText('Nhập mật khẩu.')).toBeInTheDocument()
  expect(screen.queryByText(/8 đến 128/)).not.toBeInTheDocument()
})

// Review 12/11, A12: an email that has an account offers to sign in with it
test('an email that already has an account offers to sign in with it, keeping the email', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => json(409, { error: { code: 'email_taken', message: 'taken' } })),
  )
  const user = userEvent.setup()
  renderApp('/', { signedOut: true })
  await user.click(await screen.findByRole('button', { name: 'Tạo tài khoản' }))
  await user.type(screen.getByLabelText('Email'), 'an@test.local')
  await user.type(screen.getByLabelText('Tên của bạn'), 'An')
  await user.type(screen.getByLabelText('Mật khẩu'), 'mat-khau-dai')
  const form = screen.getByLabelText('Email').closest('form') as HTMLElement
  await user.click(within(form).getByRole('button', { name: 'Tạo tài khoản' }))
  await user.click(await screen.findByRole('button', { name: 'Đăng nhập bằng email này' }))
  expect(screen.getByRole('button', { name: 'Đăng nhập', pressed: true })).toBeInTheDocument()
  expect(screen.getByLabelText('Email')).toHaveValue('an@test.local')
})