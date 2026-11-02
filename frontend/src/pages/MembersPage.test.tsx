import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { mockApi, renderApp } from '../test/renderApp'

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
  expect(within(row('Tiến')).getByText('Chủ nhà')).toBeInTheDocument()
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
  await user.click(screen.getByRole('button', { name: 'Sao chép đường dẫn mời' }))
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

test('approving someone onto a name nobody has keeps that name and its history', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7/members')

  const asking = await screen.findByRole('region', { name: 'Người xin vào nhà' })
  await user.selectOptions(within(asking).getByLabelText('Tên trong nhà'), 'Nhận tên có sẵn: Anh')
  await user.click(within(asking).getByRole('button', { name: 'Duyệt' }))

  await waitFor(() => expect(within(row('Anh')).queryByText('Chưa có tài khoản')).not.toBeInTheDocument())
  const approve = fetchFn.mock.calls.find(([url]) => String(url).endsWith('/approve'))
  expect(JSON.parse(approve?.[1]?.body as string)).toEqual({ member_id: 3 })
})

test('declining a request', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7/members')

  const asking = await screen.findByRole('region', { name: 'Người xin vào nhà' })
  await user.click(within(asking).getByRole('button', { name: 'Từ chối' }))

  expect(await screen.findByText('Đã từ chối Lan.')).toBeInTheDocument()
})

test('the owner takes someone out of the group; their name stays', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7/members')

  await user.click(await screen.findByRole('button', { name: 'Mời Minh ra khỏi nhà' }))

  await waitFor(() => expect(within(row('Minh')).getByText('Chưa có tài khoản')).toBeInTheDocument())
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('vẫn giữ nguyên'))
})

test('a name nobody uses can be removed; the owner has no Remove on their own row', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7/members')

  await user.click(await screen.findByRole('button', { name: 'Xoá Anh' }))

  await waitFor(() => expect(screen.queryByText('Anh', { selector: '.who strong' })).not.toBeInTheDocument())
  expect(within(row('Tiến')).queryByRole('button', { name: /Xoá|Mời/ })).not.toBeInTheDocument()
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

test('a member sees the code but no owner tools, and can leave', async () => {
  const fetchFn = api(asMember, { 'POST /api/households/7/leave': [204], 'GET /api/households': [200, { households: [], pending: [] }] })
  const user = userEvent.setup()
  renderApp('/households/7/members')

  expect(await screen.findByText('K7QM-2XRT')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Đổi mã mới' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Người xin vào nhà' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Đổi tên/ })).not.toBeInTheDocument()
  expect(fetchFn.mock.calls.some(([url]) => String(url).endsWith('/requests'))).toBe(false)

  await user.click(screen.getByRole('button', { name: 'Rời nhà này' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Nhà của bạn' })).toBeInTheDocument()
})
