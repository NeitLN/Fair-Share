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

// A part's save, found inside that part (specs/017, FR-028): "Lưu" today and "Lưu tên" later both
// match, and moving the parts around cannot make a test press another part's button
const saveIn = (part: string) =>
  within(screen.getByRole('region', { name: part })).getByRole('button', { name: /^Lưu/ })

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
  await user.click(saveIn('Tên của bạn'))
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
  await user.click(saveIn('Tên của bạn'))
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
  await user.click(saveIn('Tên của bạn'))
  expect(screen.getByText('Nhập tên của bạn.')).toBeInTheDocument()
  expect(field).toHaveAttribute('aria-invalid', 'true')
  await user.type(field, 'x'.repeat(41))
  await user.click(saveIn('Tên của bạn'))
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
  await user.click(saveIn('Trạng thái'))
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
  await user.click(saveIn('Trạng thái'))
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
  await user.click(saveIn('Bạn cùng nhà thấy bạn thế này'))
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
  await user.click(saveIn('Bạn cùng nhà thấy bạn thế này'))
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
  await user.click(saveIn('Giới tính'))
  expect(await screen.findByText('Đã lưu giới tính.')).toBeInTheDocument()
  await user.click(screen.getByRole('radio', { name: 'Không nêu' }))
  await user.click(saveIn('Giới tính'))
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
  await user.click(saveIn('Tài khoản nhận tiền'))

  expect(await screen.findByText('NGUYEN VAN MINH', { selector: 'dd' })).toBeInTheDocument()
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
  await user.click(saveIn('Tài khoản nhận tiền'))
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
  expect(await screen.findByText('NGUYEN VAN MINH', { selector: 'dd' })).toBeInTheDocument()
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
  await user.click(saveIn('Tài khoản nhận tiền'))
  unmount()
  await act(async () => answer([200, { account: saved }]))
  await waitFor(() => expect(client.getQueryData(['me', 'receiving-account'])).toBeUndefined())
  expect(JSON.stringify(client.getQueryCache().getAll().map((q) => q.state.data))).not.toContain('0123456789')
})

// --- specs/017-houses-profile-redesign: layout (US3) ---------------------------------------------

const card = () => screen.getByRole('region', { name: 'Bạn cùng nhà thấy bạn thế này' })

test('a way back, then how housemates see you, then the parts in their order', async () => {
  mockApi({ ...noHouses, ...noPhoto, 'GET /api/me/receiving-account': [200, { account: saved }] })
  renderApp('/account')
  const back = screen.getByRole('link', { name: 'Nhà của bạn' })
  expect(back).toHaveAttribute('href', '/')
  const title = screen.getByRole('heading', { level: 1, name: 'Hồ sơ của bạn' })
  expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(document.title).toBe('Hồ sơ của bạn · Fair-Share')

  const names = screen.getAllByRole('region').map((region) => region.getAttribute('aria-labelledby'))
  expect(names).toEqual([
    'profile-card-title',
    'profile-name-title',
    'profile-status-title',
    'profile-receiving-title',
    'profile-password-title',
    'profile-gender-title',
  ])
  // Saved values only: the name, no status yet, the email, and the account as housemates see it
  expect(within(card()).getByText('Tiến', { selector: 'strong' })).toBeInTheDocument()
  expect(within(card()).getByText('Chưa có trạng thái')).toBeInTheDocument()
  expect(within(card()).getByText(testUser.email)).toBeInTheDocument()
  expect(await within(card()).findByText('Có tài khoản nhận tiền · Vietcombank •••• 6789')).toBeInTheDocument()
})

test('what is typed and not saved never shows on the card', async () => {
  mockApi({ ...noHouses, ...noPhoto })
  const user = userEvent.setup()
  renderApp('/account')
  await user.type(screen.getByLabelText('Trạng thái bạn cùng nhà thấy'), 'đang ăn kiêng')
  expect(within(card()).queryByText('đang ăn kiêng')).not.toBeInTheDocument()
  expect(within(card()).getByText('Chưa có trạng thái')).toBeInTheDocument()
})

test('a bank no longer listed gives the card no hint line', async () => {
  mockApi({
    ...noHouses,
    ...noPhoto,
    'GET /api/me/receiving-account': [200, { account: { ...saved, bank_name: null, supported: false } }],
  })
  renderApp('/account')
  await screen.findByText(/^Ngân hàng này không còn trong danh sách VietQR/)
  expect(within(card()).queryByText(/Có tài khoản nhận tiền/)).not.toBeInTheDocument()
})

test('a saved account reads as three labelled values', async () => {
  mockApi({ ...noHouses, ...noPhoto, 'GET /api/me/receiving-account': [200, { account: saved }] })
  renderApp('/account')
  await screen.findByText('NGUYEN VAN MINH', { selector: 'dd' })
  const terms = [...section().querySelectorAll('dl.receiving-facts dt')].map((dt) => dt.textContent)
  const values = [...section().querySelectorAll('dl.receiving-facts dd')].map((dd) => dd.textContent)
  expect(terms).toEqual(['Ngân hàng hoặc ví', 'Số tài khoản', 'Tên chủ tài khoản'])
  expect(values).toEqual(['Vietcombank', '0123456789', 'NGUYEN VAN MINH'])
})

test('the account menu marks the profile as the current page and takes the keyboard to its title', async () => {
  mockApi({ ...noHouses, ...noPhoto })
  const user = userEvent.setup()
  renderApp('/')
  await user.click(screen.getByLabelText('Tài khoản: Tiến'))
  expect(screen.getByRole('link', { name: 'Hồ sơ của bạn' })).not.toHaveAttribute('aria-current')
  await user.click(screen.getByRole('link', { name: 'Hồ sơ của bạn' }))
  const title = await screen.findByRole('heading', { level: 1, name: 'Hồ sơ của bạn' })
  await waitFor(() => expect(title).toHaveFocus())
  await user.click(screen.getByLabelText('Tài khoản: Tiến'))
  expect(screen.getByRole('link', { name: 'Hồ sơ của bạn' })).toHaveAttribute('aria-current', 'page')
})

// --- specs/017-houses-profile-redesign: saving (US4) ---------------------------------------------

test('each part saves under its own name', async () => {
  vi.mocked(cropToSquare).mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
  mockApi({ ...noHouses, ...noPhoto, 'GET /api/me/receiving-account': [200, { account: null }] })
  const user = userEvent.setup()
  renderApp('/account')
  await user.click(await screen.findByRole('button', { name: 'Thêm tài khoản' }))
  await pickFile()
  await screen.findByRole('button', { name: 'Lưu ảnh' })
  for (const name of ['Lưu ảnh', 'Lưu tên', 'Lưu trạng thái', 'Lưu tài khoản', 'Đổi mật khẩu', 'Lưu giới tính']) {
    expect(screen.getAllByRole('button', { name })).toHaveLength(1)
  }
  expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument()
})

test('Chưa lưu shows by the part that was typed in and goes once it is saved', async () => {
  mockApi({
    ...noHouses,
    ...noPhoto,
    'PUT /api/me/status': (body) => [200, { ...testUser, status: (body as { status: string }).status }],
  })
  const user = userEvent.setup()
  renderApp('/account')
  const status = within(screen.getByRole('region', { name: 'Trạng thái' }))
  expect(status.queryByText('Chưa lưu')).not.toBeInTheDocument()
  await user.type(screen.getByLabelText('Trạng thái bạn cùng nhà thấy'), 'ăn kiêng')
  expect(status.getByText('Chưa lưu')).toBeInTheDocument()
  expect(status.getByRole('button', { name: 'Lưu trạng thái' })).toHaveAccessibleDescription('Chưa lưu')
  // Only that part
  expect(within(screen.getByRole('region', { name: 'Tên của bạn' })).queryByText('Chưa lưu')).not.toBeInTheDocument()
  await user.click(status.getByRole('button', { name: 'Lưu trạng thái' }))
  await screen.findByText('Đã lưu trạng thái.')
  expect(status.queryByText('Chưa lưu')).not.toBeInTheDocument()
})

// Review of #276: some keyboards send the accents as separate marks, and the server keeps NFC
test('a name typed with separate accent marks is not left as Chưa lưu once saved', async () => {
  mockApi({
    ...noHouses,
    ...noPhoto,
    'PATCH /api/me': (body) => [
      200,
      { user: { ...testUser, display_name: (body as { display_name: string }).display_name.normalize('NFC') }, kept: [] },
    ],
  })
  const user = userEvent.setup()
  renderApp('/account')
  const field = screen.getByLabelText('Tên hiển thị')
  await user.clear(field)
  await user.type(field, 'Tiến Võ'.normalize('NFD'))
  const part = within(screen.getByRole('region', { name: 'Tên của bạn' }))
  expect(part.getByText('Chưa lưu')).toBeInTheDocument()
  await user.click(part.getByRole('button', { name: 'Lưu tên' }))
  await screen.findByText('Đã đổi tên ở mọi nhà.')
  expect(part.queryByText('Chưa lưu')).not.toBeInTheDocument()
})

test('while a part saves, its button says so, ignores presses and keeps the focus', async () => {
  let answer: (value: [number, unknown]) => void = () => {}
  const api = mockApi({
    ...noHouses,
    ...noPhoto,
    'PUT /api/me/status': () => new Promise<[number, unknown]>((resolve) => (answer = resolve)),
  })
  const user = userEvent.setup()
  renderApp('/account')
  await user.type(screen.getByLabelText('Trạng thái bạn cùng nhà thấy'), 'ăn kiêng')
  await user.click(screen.getByRole('button', { name: 'Lưu trạng thái' }))
  const busy = screen.getByRole('button', { name: 'Đang lưu…' })
  expect(busy).toHaveAttribute('aria-disabled', 'true')
  expect(busy).toHaveFocus()
  await user.click(busy)
  expect(api.mock.calls.filter(([url]) => url === '/api/me/status')).toHaveLength(1)
  await act(async () => answer([200, { ...testUser, status: 'ăn kiêng' }]))
  expect(await screen.findByRole('button', { name: 'Lưu trạng thái' })).toHaveFocus()
})

test('a too long status keeps the counter, with the problem under it', async () => {
  mockApi({ ...noHouses, ...noPhoto })
  const user = userEvent.setup()
  renderApp('/account')
  const field = screen.getByLabelText('Trạng thái bạn cùng nhà thấy')
  await user.type(field, 'a'.repeat(61))
  await user.click(screen.getByRole('button', { name: 'Lưu trạng thái' }))
  expect(field).toHaveAccessibleDescription(/61\/60 ký tự.*Trạng thái dài tối đa 60 ký tự/)
})

// --- Focus after a control replaces itself (research R6, SC-003) ---------------------------------

test('the photo buttons hand the focus on: pick → Lưu ảnh, Huỷ → Chọn ảnh, saved → Đổi ảnh, removed → Chọn ảnh', async () => {
  vi.mocked(cropToSquare).mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
  let current: unknown = { version: null, data: null }
  mockApi({
    ...noHouses,
    'GET /api/me/photo': () => [200, current],
    'PUT /api/me/photo': () => {
      current = { version: 'aaaaaaaaaaaa', data: photo }
      return [200, { version: 'aaaaaaaaaaaa' }]
    },
    'DELETE /api/me/photo': () => {
      current = { version: null, data: null }
      return [204]
    },
  })
  const user = userEvent.setup()
  renderApp('/account')
  await screen.findByRole('button', { name: 'Chọn ảnh' })

  await pickFile()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu ảnh' })).toHaveFocus())
  await user.click(screen.getByRole('button', { name: 'Huỷ' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Chọn ảnh' })).toHaveFocus())

  await pickFile()
  await user.click(await screen.findByRole('button', { name: 'Lưu ảnh' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Đổi ảnh' })).toHaveFocus())

  await user.click(screen.getByRole('button', { name: 'Gỡ ảnh' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Chọn ảnh' })).toHaveFocus())
})

test('Xoá trạng thái hands the focus to the status field', async () => {
  mockApi({ ...noHouses, ...noPhoto, 'PUT /api/me/status': [200, { ...testUser, status: null }] })
  const user = userEvent.setup()
  renderApp('/account')
  act(() => updateUser({ ...testUser, status: 'đang ăn kiêng' }))
  await user.click(screen.getByRole('button', { name: 'Xoá trạng thái' }))
  await screen.findByText('Đã xoá trạng thái.')
  await waitFor(() => expect(screen.getByLabelText('Trạng thái bạn cùng nhà thấy')).toHaveFocus())
})

test('the receiving account hands the focus on: Thêm → bank, Huỷ → Thêm, saved → Sửa, removed → Thêm', async () => {
  let account: typeof saved | null = null
  mockApi({
    ...noHouses,
    ...noPhoto,
    'GET /api/me/receiving-account': () => [200, { account }],
    'PUT /api/me/receiving-account': () => {
      account = saved
      return [200, { account }]
    },
    'DELETE /api/me/receiving-account': () => {
      account = null
      return [204]
    },
  })
  vi.stubGlobal('confirm', vi.fn(() => true))
  const user = userEvent.setup()
  renderApp('/account')

  await user.click(await screen.findByRole('button', { name: 'Thêm tài khoản' }))
  await waitFor(() => expect(screen.getByLabelText('Ngân hàng hoặc ví')).toHaveFocus())
  await user.click(within(section()).getByRole('button', { name: 'Huỷ' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Thêm tài khoản' })).toHaveFocus())

  await user.click(screen.getByRole('button', { name: 'Thêm tài khoản' }))
  await user.selectOptions(screen.getByLabelText('Ngân hàng hoặc ví'), 'Vietcombank')
  expect(within(section()).getByText('Chưa lưu')).toBeInTheDocument()
  await user.type(screen.getByLabelText('Số tài khoản'), '0123456789')
  await user.type(screen.getByLabelText('Tên chủ tài khoản'), 'Minh')
  await user.click(screen.getByRole('button', { name: 'Lưu tài khoản' }))
  await waitFor(() => expect(within(section()).getByRole('button', { name: 'Sửa' })).toHaveFocus())

  await user.click(within(section()).getByRole('button', { name: 'Xoá' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Thêm tài khoản' })).toHaveFocus())
})

