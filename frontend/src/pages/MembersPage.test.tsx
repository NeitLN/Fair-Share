import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { keys } from '../api/households'
import { mockApi, renderApp } from '../test/renderApp'
import { onAComputer } from '../test/screen'

beforeEach(() => {
  // The user answers "OK" to every confirm()
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const T = '2026-10-16T00:00:00Z'
const asOwner = { id: 7, name: 'Nhà 7', created_at: T, role: 'owner', member_id: 2 }
const asMember = { ...asOwner, role: 'member', member_id: 1 }
const minh = { id: 1, household_id: 7, name: 'Minh', created_at: T, role: 'member', user_id: 21 }
const tien = { id: 2, household_id: 7, name: 'Tiến', created_at: T, role: 'owner', user_id: 9 }
// A name from before accounts that nobody has taken yet
const anh = { id: 3, household_id: 7, name: 'Anh', created_at: T, role: null, user_id: null }
const lan = { user_id: 30, display_name: 'Lan', email: 'lan@test.local', requested_at: T }
const nameTaken: [number, unknown] = [
  409,
  { error: { code: 'member_name_taken', message: 'This household already has a member with that name' } },
]

function api(household = asOwner, extra: Parameters<typeof mockApi>[0] = {}) {
  let members = [minh, tien, anh]
  let requests = [lan]
  return mockApi({
    'GET /api/households/7': [200, household],
    'GET /api/households/7/members': () => [200, members],
    'GET /api/households/7/invite': [200, { code: 'K7QM2XRT', expires_at: '2026-11-09T00:00:00Z' }],
    'POST /api/households/7/invite': [200, { code: 'NEWC0DE5', expires_at: '2026-11-10T00:00:00Z' }],
    'GET /api/households/7/requests': () => [200, requests],
    'POST /api/households/7/requests/30/approve': (body) => {
      const into = (body as { member_id?: number }).member_id
      const added = into
        ? { ...anh, role: 'member', user_id: 30 }
        : { id: 4, household_id: 7, name: 'Lan', created_at: T, role: 'member', user_id: 30 }
      members = into ? members.map((m) => (m.id === into ? added : m)) : [...members, added]
      requests = []
      return [200, added]
    },
    'POST /api/households/7/requests/30/reject': () => {
      requests = []
      return [204]
    },
    'DELETE /api/households/7/people/21': () => {
      members = members.map((m) => (m.id === 1 ? { ...m, role: null, user_id: null } : m))
      return [204]
    },
    'DELETE /api/members/3': () => {
      members = members.filter((m) => m.id !== 3)
      return [204]
    },
    ...extra,
  })
}

const row = (name: string) => screen.getByText(name, { selector: '.who strong' }).closest('li') as HTMLElement

test('lists the names, the owner and the ones without an account marked', async () => {
  api()
  renderApp('/households/7/members')
  expect(await screen.findByText('Minh', { selector: '.who strong' })).toBeInTheDocument()
  expect(within(row('Tiến')).getByText('Trưởng nhóm')).toBeInTheDocument()
  expect(within(row('Anh')).getByText('Chưa có tài khoản')).toBeInTheDocument()
  // Nobody adds a name by hand any more: people join with the code
  expect(screen.queryByLabelText('Tên thành viên')).not.toBeInTheDocument()
})

test('the invite code is shown big, and copying it puts it on the clipboard', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7/members')

  expect(await screen.findByText('K7QM-2XRT')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Sao chép mã' }))
  expect(await navigator.clipboard.readText()).toBe('K7QM-2XRT')
  await user.click(screen.getByRole('button', { name: 'Sao chép link mời' }))
  expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/join/K7QM2XRT`)
})

test('when copying is not possible the code is shown, selected, to copy by hand', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7/members')
  await screen.findByText('K7QM-2XRT')
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))

  await user.click(screen.getByRole('button', { name: 'Sao chép mã' }))

  const field = await screen.findByLabelText(/Không sao chép được/)
  expect(field).toHaveValue('K7QM-2XRT')
  await waitFor(() => expect(field).toHaveFocus())
})

test('the owner can replace the code; the new one is shown', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7/members')
  await screen.findByText('K7QM-2XRT')

  await user.click(screen.getByRole('button', { name: 'Đổi mã mới' }))

  expect(await screen.findByText('NEWC-0DE5')).toBeInTheDocument()
})

test('approving someone with a new name puts them in the list', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7/members')

  const asking = await screen.findByRole('region', { name: 'Người xin vào nhà' })
  expect(within(asking).getByText('lan@test.local')).toBeInTheDocument()
  await user.click(within(asking).getByRole('button', { name: 'Duyệt' }))

  expect(await screen.findByText('Lan đã vào nhà.')).toBeInTheDocument()
  expect(await screen.findByText('Lan', { selector: '.who strong' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Người xin vào nhà' })).not.toBeInTheDocument()
  const approve = fetchFn.mock.calls.find(([url]) => String(url).endsWith('/approve'))
  expect(JSON.parse(approve?.[1]?.body as string)).toEqual({})
})

test('when the group already has that name, the owner approves them under another one', async () => {
  const fetchFn = api(asOwner, {
    'POST /api/households/7/requests/30/approve': (body) =>
      (body as { name?: string }).name
        ? [200, { id: 4, household_id: 7, name: 'Lan Anh', created_at: T, role: 'member', user_id: 30 }]
        : nameTaken,
  })
  const user = userEvent.setup()
  renderApp('/households/7/members')

  const asking = await screen.findByRole('region', { name: 'Người xin vào nhà' })
  await user.click(within(asking).getByRole('button', { name: 'Duyệt' }))
  expect(await within(asking).findByRole('alert')).toHaveTextContent('Nhà này đã có thành viên trùng tên.')

  const field = within(asking).getByLabelText('Tên mới cho Lan')
  await user.clear(field)
  expect(within(asking).getByRole('button', { name: 'Duyệt' })).toBeDisabled()
  await user.type(field, 'Lan Anh')
  await user.click(within(asking).getByRole('button', { name: 'Duyệt' }))

  expect(await screen.findByText('Lan Anh đã vào nhà.')).toBeInTheDocument()
  const approvals = fetchFn.mock.calls.filter(([url]) => String(url).endsWith('/approve'))
  expect(JSON.parse(approvals[1]?.[1]?.body as string)).toEqual({ name: 'Lan Anh' })
})

test('approving someone onto a name nobody has keeps that name and its history', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7/members')

  const asking = await screen.findByRole('region', { name: 'Người xin vào nhà' })
  await user.selectOptions(within(asking).getByLabelText('Vào nhà với tên'), 'Nhận tên có sẵn: Anh')
  await user.click(within(asking).getByRole('button', { name: 'Duyệt' }))

  await waitFor(() => expect(within(row('Anh')).queryByText('Chưa có tài khoản')).not.toBeInTheDocument())
  const approve = fetchFn.mock.calls.find(([url]) => String(url).endsWith('/approve'))
  expect(JSON.parse(approve?.[1]?.body as string)).toEqual({ member_id: 3 })
})

test('with no name left to take over, there is no menu: just the name they join under', async () => {
  api(asOwner, { 'GET /api/households/7/members': [200, [minh, tien]] })
  renderApp('/households/7/members')

  const asking = await screen.findByRole('region', { name: 'Người xin vào nhà' })
  expect(await within(asking).findByLabelText('Vào nhà với tên')).toHaveValue('Lan')
  expect(within(asking).queryByRole('combobox')).not.toBeInTheDocument()
})

test('declining a request', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7/members')

  const asking = await screen.findByRole('region', { name: 'Người xin vào nhà' })
  await user.click(within(asking).getByRole('button', { name: 'Từ chối' }))

  expect(await screen.findByText('Đã từ chối Lan.')).toBeInTheDocument()
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('nhập mã mời lại'))
})

test('declining asks first; answering no keeps the request', async () => {
  const fetchFn = api()
  vi.stubGlobal('confirm', vi.fn(() => false))
  const user = userEvent.setup()
  renderApp('/households/7/members')

  const asking = await screen.findByRole('region', { name: 'Người xin vào nhà' })
  await user.click(within(asking).getByRole('button', { name: 'Từ chối' }))

  expect(within(asking).getByText('lan@test.local')).toBeInTheDocument()
  expect(fetchFn.mock.calls.some(([url]) => String(url).endsWith('/reject'))).toBe(false)
})

test('the owner takes someone out of the group; their name stays', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7/members')

  await user.click(await screen.findByRole('button', { name: 'Bỏ quyền vào nhà của Minh' }))

  await waitFor(() => expect(within(row('Minh')).getByText('Chưa có tài khoản')).toBeInTheDocument())
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('vẫn giữ nguyên'))
})

test('a name nobody uses can be removed; the owner has no Remove on their own row', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7/members')

  await user.click(await screen.findByRole('button', { name: 'Xoá Anh' }))

  await waitFor(() => expect(screen.queryByText('Anh', { selector: '.who strong' })).not.toBeInTheDocument())
  expect(within(row('Tiến')).queryByRole('button', { name: /Xoá|Bỏ quyền/ })).not.toBeInTheDocument()
})

test('renaming keeps edit mode open when the name is taken', async () => {
  api(asOwner, { 'PATCH /api/members/1': nameTaken })
  const user = userEvent.setup()
  renderApp('/households/7/members')

  await user.click(await screen.findByRole('button', { name: 'Đổi tên Minh' }))
  const field = screen.getByLabelText('Tên mới cho Minh')
  await user.clear(field)
  await user.type(field, 'Tiến')
  await user.click(screen.getByRole('button', { name: 'Lưu' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Nhà này đã có thành viên trùng tên.')
  expect(screen.getByLabelText('Tên mới cho Minh')).toHaveValue('Tiến')
})

// Owner, 07/11: the API could rename a house but the page had no way to
test('the owner renames the house from Thành viên; an empty name is refused before sending', async () => {
  const fetchFn = api(asOwner, { 'PATCH /api/households/7': [200, { ...asOwner, name: 'Nhà trọ Q7' }] })
  const user = userEvent.setup()
  renderApp('/households/7/members')

  await user.click(await screen.findByText('Đổi tên nhà'))
  const field = screen.getByLabelText('Tên nhà')
  expect(field).toHaveValue('Nhà 7')
  await user.clear(field)
  await user.click(screen.getByRole('button', { name: 'Lưu tên nhà' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Tên nhà phải từ 1 đến 60 ký tự.')

  await user.type(field, '  Nhà trọ Q7 ')
  await user.click(screen.getByRole('button', { name: 'Lưu tên nhà' }))
  expect(await screen.findByText('Đã đổi tên nhà.')).toBeInTheDocument()
  const patch = fetchFn.mock.calls.find(([url, init]) => String(url).endsWith('/api/households/7') && init?.method === 'PATCH')
  expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ name: 'Nhà trọ Q7' })
})

test('a member sees the code but no owner tools, and can leave', async () => {
  const fetchFn = api(asMember, { 'POST /api/households/7/leave': [204], 'GET /api/households': [200, { households: [], pending: [] }] })
  const user = userEvent.setup()
  renderApp('/households/7/members')

  expect(await screen.findByText('K7QM-2XRT')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Đổi mã mới' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Người xin vào nhà' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Đổi tên/ })).not.toBeInTheDocument()
  expect(screen.queryByText('Đổi tên nhà')).not.toBeInTheDocument()
  expect(fetchFn.mock.calls.some(([url]) => String(url).endsWith('/requests'))).toBe(false)

  await user.click(screen.getByRole('button', { name: 'Rời nhà này' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Nhà của bạn' })).toBeInTheDocument()
})

// #230 review: the photos of a house you left are not kept in this browser
test('leaving a house drops its photos from the cache too', async () => {
  const photo = 'data:image/jpeg;base64,/9j/AA=='
  api(asMember, {
    'GET /api/households/7/members': [200, [{ ...minh, photo_version: 'aaaaaaaaaaaa' }, tien, anh]],
    'GET /api/households/7/photos': [200, { photos: [{ member_id: 1, version: 'aaaaaaaaaaaa', data: photo }] }],
    'POST /api/households/7/leave': [204],
    'GET /api/households': [200, { households: [], pending: [] }],
  })
  const user = userEvent.setup()
  const { client } = renderApp('/households/7/members')
  await waitFor(() => expect(client.getQueriesData({ queryKey: keys.housePhotos(7) }).some(([, d]) => d)).toBe(true))
  await user.click(screen.getByRole('button', { name: 'Rời nhà này' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Nhà của bạn' })).toBeInTheDocument()
  // A page closing may leave an empty, switched-off entry; no photo data may stay. Waited for: on a slow
  // runner the members page can still be closing when the house list shows (seen once in CI on #235)
  await waitFor(() =>
    expect(client.getQueriesData({ queryKey: keys.housePhotos(7) }).every(([, data]) => data === undefined)).toBe(true),
  )
})

test('on a computer the people come first, then a request to approve, then the invite', async () => {
  onAComputer()
  api()
  renderApp('/households/7/members')

  const asking = await screen.findByRole('region', { name: 'Người xin vào nhà' })
  const people = await screen.findByRole('button', { name: 'Đổi tên Minh' })
  const invite = screen.getByText('Mời bạn cùng phòng')
  expect(people.compareDocumentPosition(asking) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(asking.compareDocumentPosition(invite) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('someone asking to join shows as a count on the Thành viên tab for the owner', async () => {
  api()
  renderApp('/households/7/members')

  expect(await screen.findByRole('link', { name: /^Thành viên.*1 người xin vào nhà$/ })).toBeInTheDocument()
})

test('on a phone that can share, Gửi link mời opens the share sheet with the invite link', async () => {
  const share = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'share', { value: share, configurable: true })
  try {
    api()
    const user = userEvent.setup()
    renderApp('/households/7/members')

    await user.click(await screen.findByRole('button', { name: 'Gửi link mời' }))
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringMatching(/\/join\/K7QM2XRT$/) }))
  } finally {
    Reflect.deleteProperty(navigator, 'share')
  }
})

// specs/010-profile-page, US4: one request for the house's photos, then avatars show them
test('the photos come in one request for the whole house and show on that person', async () => {
  const photo = 'data:image/jpeg;base64,/9j/AA=='
  const fetchFn = api(asOwner, {
    'GET /api/households/7/members': [200, [{ ...minh, photo_version: 'aaaaaaaaaaaa' }, tien, anh]],
    'GET /api/households/7/photos': [200, { photos: [{ member_id: 1, version: 'aaaaaaaaaaaa', data: photo }] }],
  })
  renderApp('/households/7/members')
  await waitFor(() => expect(document.querySelectorAll(`img[src="${photo}"]`).length).toBeGreaterThan(0))
  expect(row('Minh').querySelector(`img[src="${photo}"]`)).not.toBeNull()
  expect(row('Tiến').querySelector('img')).toBeNull()
  expect(fetchFn.mock.calls.filter(([url]) => url === '/api/households/7/photos')).toHaveLength(1)
})

// #228 review: saving an expense invalidates ['households', 7]; the photos must not come again
test('a change elsewhere in the house does not fetch the photos again', async () => {
  const photo = 'data:image/jpeg;base64,/9j/AA=='
  const fetchFn = api(asOwner, {
    'GET /api/households/7/members': [200, [{ ...minh, photo_version: 'aaaaaaaaaaaa' }, tien, anh]],
    'GET /api/households/7/photos': [200, { photos: [{ member_id: 1, version: 'aaaaaaaaaaaa', data: photo }] }],
  })
  const { client } = renderApp('/households/7/members')
  await waitFor(() => expect(row('Minh').querySelector(`img[src="${photo}"]`)).not.toBeNull())
  await client.invalidateQueries({ queryKey: ['households', 7] })
  await waitFor(() =>
    expect(fetchFn.mock.calls.filter(([url]) => url === '/api/households/7/members').length).toBeGreaterThan(1),
  )
  expect(fetchFn.mock.calls.filter(([url]) => url === '/api/households/7/photos')).toHaveLength(1)
  expect(row('Minh').querySelector(`img[src="${photo}"]`)).not.toBeNull()
})

test('nobody with a photo means no photo request at all', async () => {
  const fetchFn = api()
  renderApp('/households/7/members')
  expect(await screen.findByText('Minh', { selector: '.who strong' })).toBeInTheDocument()
  expect(fetchFn.mock.calls.some(([url]) => url === '/api/households/7/photos')).toBe(false)
})
