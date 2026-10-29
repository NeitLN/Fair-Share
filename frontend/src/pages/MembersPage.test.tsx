import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { mockApi, renderApp, testKey } from '../test/renderApp'

beforeEach(() => {
  // The user answers "OK" to "Xoá … khỏi nhà?"
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const household = { id: 7, name: 'Nhà 7', created_at: '2026-10-16T00:00:00Z' }
const minh = { id: 1, household_id: 7, name: 'Minh', created_at: '2026-10-16T00:00:00Z' }
const tien = { id: 2, household_id: 7, name: 'Tiến', created_at: '2026-10-16T00:00:00Z' }
// What the API answers for a duplicate name (app/routers/households.py)
const nameTaken: [number, unknown] = [
  409,
  { error: { code: 'member_name_taken', message: 'This household already has a member with that name' } },
]

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  let members = [minh, tien]
  return mockApi({
    'GET /api/households/7': [200, household],
    'GET /api/households/7/members': () => [200, members],
    'POST /api/households/7/members': (body) => {
      const added = { id: 3, household_id: 7, name: (body as { name: string }).name, created_at: '' }
      members = [...members, added]
      return [201, added]
    },
    'DELETE /api/members/2': () => {
      members = members.filter((m) => m.id !== 2)
      return [204]
    },
    ...extra,
  })
}

test('lists the members of the household', async () => {
  api()
  renderApp('/households/7/members')
  expect(await screen.findByText('Minh')).toBeInTheDocument()
  expect(screen.getByText('Tiến')).toBeInTheDocument()
})

test('adding a member shows them in the list', async () => {
  api()
  renderApp('/households/7/members')

  await userEvent.type(await screen.findByLabelText('Tên thành viên'), 'Duy Anh')
  await userEvent.click(screen.getByRole('button', { name: 'Thêm thành viên' }))

  expect(await screen.findByText('Duy Anh')).toBeInTheDocument()
  expect(screen.getByLabelText('Tên thành viên')).toHaveValue('')
})

test('a duplicate name is explained in Vietnamese and the text is kept', async () => {
  api({ 'POST /api/households/7/members': nameTaken })
  renderApp('/households/7/members')

  await userEvent.type(await screen.findByLabelText('Tên thành viên'), 'Minh')
  await userEvent.click(screen.getByRole('button', { name: 'Thêm thành viên' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Nhà này đã có thành viên trùng tên.')
  expect(screen.getByLabelText('Tên thành viên')).toHaveValue('Minh')
})

test('a full household (50 members) says so in Vietnamese and keeps the text', async () => {
  api({
    'POST /api/households/7/members': [
      409,
      { error: { code: 'too_many_members', message: 'A household has at most 50 members' } },
    ],
  })
  renderApp('/households/7/members')

  await userEvent.type(await screen.findByLabelText('Tên thành viên'), 'Người 51')
  await userEvent.click(screen.getByRole('button', { name: 'Thêm thành viên' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Nhà đã đủ 50 thành viên, mức tối đa của một nhà.')
  expect(screen.queryByText('A household has at most 50 members')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Tên thành viên')).toHaveValue('Người 51')
})

test('removing a member takes them off the list', async () => {
  api()
  renderApp('/households/7/members')

  await userEvent.click(await screen.findByRole('button', { name: 'Xoá Tiến' }))

  await waitFor(() => expect(screen.queryByText('Tiến')).not.toBeInTheDocument())
})

test('a member used by an expense cannot be removed, and the page says why', async () => {
  api({
    'DELETE /api/members/1': [
      409,
      { error: { code: 'member_in_use', message: 'member is referenced by an expense' } },
    ],
  })
  renderApp('/households/7/members')

  await userEvent.click(await screen.findByRole('button', { name: 'Xoá Minh' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('người này đã có trong một khoản chi hoặc khoản trả')
  expect(screen.getByText('Minh')).toBeInTheDocument()
})

test('renaming keeps edit mode open when the name is taken', async () => {
  api({ 'PATCH /api/members/1': nameTaken })
  renderApp('/households/7/members')

  await userEvent.click(await screen.findByRole('button', { name: 'Đổi tên Minh' }))
  const input = screen.getByLabelText('Tên mới cho Minh')
  await userEvent.clear(input)
  await userEvent.type(input, 'Tiến')
  await userEvent.click(screen.getByRole('button', { name: 'Lưu' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('trùng tên')
  expect(screen.getByLabelText('Tên mới cho Minh')).toHaveValue('Tiến')
})

test('Sao chép đường dẫn mời puts the invite link, with its key, on the clipboard (#132)', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7/members')

  await user.click(await screen.findByRole('button', { name: 'Sao chép đường dẫn mời' }))

  expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/households/7#k=${testKey(7)}`)
  expect(await screen.findByRole('status')).toHaveTextContent('Đã sao chép đường dẫn mời.')
})

test('when copying is not possible the invite link is shown, selected, to copy by hand', async () => {
  api()
  const user = userEvent.setup()
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('NotAllowedError'))
  renderApp('/households/7/members')

  await user.click(await screen.findByRole('button', { name: 'Sao chép đường dẫn mời' }))

  const field = (await screen.findByLabelText(/^Không sao chép được/)) as HTMLInputElement
  expect(field.value).toBe(`${window.location.origin}/households/7#k=${testKey(7)}`)
  await waitFor(() => expect(field).toHaveFocus())
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length])
})
