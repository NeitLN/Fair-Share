import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { currentSession, updateUser } from '../lib/session'
import { cropToSquare, PhotoPickError } from '../lib/photoCrop'
import { mockApi, renderApp, testUser } from '../test/renderApp'

// jsdom draws no canvas: the crop itself is tested in lib/photoCrop.test.ts
vi.mock('../lib/photoCrop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/photoCrop')>()),
  cropToSquare: vi.fn(),
}))

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
  expect(screen.getByText('Nhập tên của bạn.')).toBeInTheDocument()
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

// #226 review: some keyboards type "ế" as e + two combining marks; the server counts after NFC
test('letters typed with separate accent marks count once, as the server counts them', async () => {
  mockApi({ ...noHouses })
  const user = userEvent.setup()
  renderApp('/account')
  await user.type(screen.getByLabelText('Trạng thái bạn cùng nhà thấy'), 'đang ăn kiêng'.normalize('NFD'))
  expect(screen.getByText(/^13\/60 ký tự/)).toBeInTheDocument()
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

// --- Photo (specs/010-profile-page, US4) ---

const photo = 'data:image/jpeg;base64,/9j/AA=='
const noPhoto = { 'GET /api/me/photo': [200, { version: null, data: null }] } as Record<string, [number, unknown]>

// jsdom has no object URLs; the preview only needs a stand-in
Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: () => {} })

function pickFile() {
  const input = document.querySelector<HTMLInputElement>('#profile-photo-file')!
  const file = new File(['x'], 'me.heic', { type: 'image/heic' })
  return userEvent.upload(input, file)
}

test('a picked photo is previewed as it will be saved, then sent as a JPEG', async () => {
  vi.mocked(cropToSquare).mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
  const api = mockApi({ ...noHouses, ...noPhoto, 'PUT /api/me/photo': [200, { version: 'aaaaaaaaaaaa' }] })
  const user = userEvent.setup()
  renderApp('/account')
  expect(await screen.findByRole('button', { name: 'Chọn ảnh' })).toBeInTheDocument()
  await pickFile()
  expect(await screen.findByText('Ảnh sẽ trông như thế này. Lưu để dùng, hoặc Huỷ.')).toBeInTheDocument()
  expect(document.querySelector('.profile-photo img')).toHaveAttribute('src', 'blob:preview')
  await user.click(screen.getAllByRole('button', { name: 'Lưu' })[0])
  expect(await screen.findByText('Đã lưu ảnh đại diện.')).toBeInTheDocument()
  const sent = api.mock.calls.find(([url, init]) => url === '/api/me/photo' && init?.method === 'PUT')
  expect(new Headers(sent?.[1]?.headers).get('Content-Type')).toBe('image/jpeg')
  expect(sent?.[1]?.body).toBeInstanceOf(Blob)
})

test('a picture the browser cannot open says which kinds work, and nothing is sent', async () => {
  vi.mocked(cropToSquare).mockRejectedValue(new PhotoPickError('unreadable'))
  const api = mockApi({ ...noHouses, ...noPhoto })
  renderApp('/account')
  await screen.findByRole('button', { name: 'Chọn ảnh' })
  await pickFile()
  expect(await screen.findByText('Chưa đọc được ảnh này. Chọn ảnh JPEG, PNG hoặc WebP nhé.')).toBeInTheDocument()
  expect(api.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
})

test('a saved photo shows, and Gỡ ảnh goes back to the initial', async () => {
  let current: unknown = { version: 'aaaaaaaaaaaa', data: photo }
  mockApi({
    ...noHouses,
    'GET /api/me/photo': () => [200, current],
    'DELETE /api/me/photo': () => {
      current = { version: null, data: null }
      return [204]
    },
  })
  const user = userEvent.setup()
  renderApp('/account')
  await waitFor(() => expect(document.querySelector('.profile-photo img')).toHaveAttribute('src', photo))
  await user.click(screen.getByRole('button', { name: 'Gỡ ảnh' }))
  expect(await screen.findByText('Đã gỡ ảnh. Avatar của bạn về lại chữ cái đầu.')).toBeInTheDocument()
  await waitFor(() => expect(document.querySelector('.profile-photo img')).toBeNull())
  expect(document.querySelector('.profile-photo .avatar')).toHaveTextContent('T')
})

test('a full photo store is said in plain words', async () => {
  vi.mocked(cropToSquare).mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
  mockApi({
    ...noHouses,
    ...noPhoto,
    'PUT /api/me/photo': [507, { error: { code: 'photo_storage_full', message: 'full' } }],
  })
  const user = userEvent.setup()
  renderApp('/account')
  await screen.findByRole('button', { name: 'Chọn ảnh' })
  await pickFile()
  await screen.findByText('Ảnh sẽ trông như thế này. Lưu để dùng, hoặc Huỷ.')
  await user.click(screen.getAllByRole('button', { name: 'Lưu' })[0])
  expect(await screen.findByText('Kho ảnh đã đầy, tạm thời chưa thêm ảnh mới được.')).toBeInTheDocument()
})

// --- Gender (specs/010-profile-page, US5) ---

test('gender starts as Không nêu, and the notice is shown before the choice', async () => {
  mockApi({ ...noHouses, ...noPhoto })
  renderApp('/account')
  const none = await screen.findByRole('radio', { name: 'Không nêu' })
  expect(none).toBeChecked()
  const notice = screen.getByText(/^Không bắt buộc, để bạn cùng nhà biết giới tính của bạn/)
  expect(notice.compareDocumentPosition(none) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('a chosen gender is sent with the notice version, and Không nêu sends null', async () => {
  const api = mockApi({
    ...noHouses,
    ...noPhoto,
    'PUT /api/me/gender': (body) => [200, { ...testUser, gender: (body as { gender: string | null }).gender }],
  })
  const user = userEvent.setup()
  renderApp('/account')
  await user.click(await screen.findByRole('radio', { name: 'Nữ' }))
  const saves = screen.getAllByRole('button', { name: 'Lưu' })
  await user.click(saves[saves.length - 1])
  expect(await screen.findByText('Đã lưu giới tính.')).toBeInTheDocument()
  await user.click(screen.getByRole('radio', { name: 'Không nêu' }))
  await user.click(saves[saves.length - 1])
  expect(await screen.findByText('Đã xoá giới tính.')).toBeInTheDocument()
  const sent = api.mock.calls
    .filter(([url]) => url === '/api/me/gender')
    .map(([, init]) => JSON.parse(String(init?.body)))
  expect(sent).toEqual([
    { gender: 'female', notice: '2026-11-v2' },
    { gender: null, notice: '2026-11-v2' },
  ])
  expect(currentSession()?.user.gender).toBeNull()
})

// --- The account I am paid on (specs/016-vietqr, US1) ---------------------------------------------

const saved = {
  bank_bin: '970436',
  bank_name: 'Vietcombank',
  account_number: '0123456789',
  holder_name: 'NGUYEN VAN MINH',
  version: 'a1b2c3d4e5f6',
  supported: true,
}
const section = () => screen.getByRole('region', { name: 'Tài khoản nhận tiền' })

test('a receiving account is added with a preview of the name and who will see it', async () => {
  let account: typeof saved | null = null
  const api = mockApi({
    ...noHouses,
    'GET /api/me/receiving-account': () => [200, { account }],
    'PUT /api/me/receiving-account': () => {
      account = saved
      return [200, { account }]
    },
  })
  const user = userEvent.setup()
  renderApp('/account')
  expect(await screen.findByText('Chưa có tài khoản nhận tiền.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Thêm tài khoản' }))
  // Who will see it, before anything is saved
  expect(screen.getByText(/^Chỉ bạn cùng nhà đang cần trả bạn mới thấy đầy đủ/)).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Ngân hàng hoặc ví'), 'Vietcombank')
  await user.type(screen.getByLabelText('Số tài khoản'), '0123 456.789')
  await user.type(screen.getByLabelText('Tên chủ tài khoản'), 'Nguyễn Văn Minh')
  expect(screen.getByText('Sẽ hiện: NGUYEN VAN MINH')).toBeInTheDocument()
  await user.click(within(section()).getByRole('button', { name: 'Lưu' }))

  expect(await screen.findByText('Vietcombank · 0123456789 · NGUYEN VAN MINH')).toBeInTheDocument()
  const put = api.mock.calls.find(([url, init]) => url === '/api/me/receiving-account' && init?.method === 'PUT')
  expect(JSON.parse(put?.[1]?.body as string)).toEqual({
    bank_bin: '970436',
    account_number: '0123 456.789',
    holder_name: 'Nguyễn Văn Minh',
  })
})

test("the server's refusals land under their fields", async () => {
  mockApi({
    ...noHouses,
    'GET /api/me/receiving-account': [200, { account: null }],
    'PUT /api/me/receiving-account': [
      422,
      { error: { code: 'bad_account_number', message: 'An account number is 6 to 19 digits' } },
    ],
  })
  const user = userEvent.setup()
  renderApp('/account')
  await user.click(await screen.findByRole('button', { name: 'Thêm tài khoản' }))
  await user.selectOptions(screen.getByLabelText('Ngân hàng hoặc ví'), 'Vietcombank')
  await user.type(screen.getByLabelText('Số tài khoản'), '12345')
  await user.type(screen.getByLabelText('Tên chủ tài khoản'), 'Minh')
  await user.click(within(section()).getByRole('button', { name: 'Lưu' }))
  expect(await screen.findByText('Số tài khoản là 6 đến 19 chữ số.')).toBeInTheDocument()
  expect(screen.getByLabelText('Số tài khoản')).toHaveAttribute('aria-invalid', 'true')
})

test('removing it asks first, then it is gone', async () => {
  let account: typeof saved | null = saved
  mockApi({
    ...noHouses,
    'GET /api/me/receiving-account': () => [200, { account }],
    'DELETE /api/me/receiving-account': () => {
      account = null
      return [204]
    },
  })
  const ask = vi.fn(() => true)
  vi.stubGlobal('confirm', ask)
  const user = userEvent.setup()
  renderApp('/account')
  expect(await screen.findByText('Vietcombank · 0123456789 · NGUYEN VAN MINH')).toBeInTheDocument()
  expect(screen.getByText(/^Đã xoá thì không ai tải được nữa/)).toBeInTheDocument()
  await user.click(within(section()).getByRole('button', { name: 'Xoá' }))
  expect(ask).toHaveBeenCalledWith('Xoá tài khoản nhận tiền? Bạn cùng nhà sẽ không mở được mã QR của bạn nữa.')
  expect(await screen.findByText('Chưa có tài khoản nhận tiền.')).toBeInTheDocument()
})

test('a bank no longer on the list says housemates will not see it', async () => {
  mockApi({
    ...noHouses,
    'GET /api/me/receiving-account': [200, { account: { ...saved, bank_name: null, supported: false } }],
  })
  renderApp('/account')
  expect(await screen.findByText(/^Ngân hàng này không còn trong danh sách VietQR/)).toBeInTheDocument()
  expect(screen.getByText(/0123456789/)).toBeInTheDocument()
})

test('leaving the page while the account is saving keeps no number in memory', async () => {
  let answer: (value: [number, unknown]) => void = () => {}
  mockApi({
    ...noHouses,
    'GET /api/me/receiving-account': [200, { account: null }],
    'PUT /api/me/receiving-account': () => new Promise<[number, unknown]>((resolve) => (answer = resolve)),
  })
  const user = userEvent.setup()
  const { client, unmount } = renderApp('/account')
  await user.click(await screen.findByRole('button', { name: 'Thêm tài khoản' }))
  await user.selectOptions(screen.getByLabelText('Ngân hàng hoặc ví'), 'Vietcombank')
  await user.type(screen.getByLabelText('Số tài khoản'), '0123456789')
  await user.type(screen.getByLabelText('Tên chủ tài khoản'), 'Minh')
  await user.click(within(section()).getByRole('button', { name: 'Lưu' }))
  unmount()
  await act(async () => answer([200, { account: saved }]))
  await waitFor(() => expect(client.getQueryData(['me', 'receiving-account'])).toBeUndefined())
  expect(JSON.stringify(client.getQueryCache().getAll().map((q) => q.state.data))).not.toContain('0123456789')
})

