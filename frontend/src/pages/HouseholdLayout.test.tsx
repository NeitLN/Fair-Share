import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { mockApi, renderApp } from '../test/renderApp'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const T = '2026-10-20T10:00:00Z'
const people = ['Võ Việt Tiến', 'Hoàng Minh', 'Nguyễn Duy Anh', 'Lan'].map((name, i) => ({
  id: 11 + i,
  household_id: 7,
  name,
  created_at: T,
  role: i === 0 ? 'owner' : 'member',
}))
const nha7 = { id: 7, name: 'Nhà trọ Q7', created_at: T, role: 'member', member_id: 12 }
const house: Record<string, [number, unknown]> = {
  'GET /api/households/7': [200, nha7],
  'GET /api/households/7/members': [200, people],
}
const notFound: [number, unknown] = [
  404,
  { error: { code: 'household_not_found', message: 'This household does not exist' } },
]
const OLD_KEY = 'a'.repeat(32)

test('shows the household name above its tabs', async () => {
  mockApi({ 'GET /api/households/7': [200, nha7] })
  renderApp('/households/7')
  expect(await screen.findByText('Nhà trọ Q7')).toBeInTheDocument()
})

test('a household this account is not in says so instead of empty tabs', async () => {
  mockApi({ 'GET /api/households/99': notFound })
  renderApp('/households/99/members')
  expect(await screen.findByRole('heading', { level: 1, name: 'Không tìm thấy nhà này' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Mục của nhà' })).not.toBeInTheDocument()
})

test('a non-numeric id never reaches the API', async () => {
  const fetchFn = mockApi({})
  renderApp('/households/abc')
  expect(await screen.findByRole('heading', { level: 1, name: 'Không tìm thấy nhà này' })).toBeInTheDocument()
  expect(fetchFn).not.toHaveBeenCalled()
})

test('the house shows three of its people, then how many more, named for screen readers', async () => {
  mockApi(house)
  renderApp('/households/7')
  const stack = await screen.findByRole('img', {
    name: '4 người: Võ Việt Tiến, Hoàng Minh, Nguyễn Duy Anh, Lan',
  })
  expect(stack).toHaveTextContent('TMA+1')
})

test('"bạn" is the name this account has in the household: there is nothing to choose', async () => {
  mockApi(house)
  renderApp('/households/7/members')
  expect(await screen.findByText('Hoàng Minh')).toBeInTheDocument()
  const minh = screen.getByText('Hoàng Minh').closest('li') as HTMLElement
  expect(minh).toHaveTextContent('bạn')
  expect(screen.queryByRole('button', { name: 'Chọn' })).not.toBeInTheDocument()
})

describe('invite links from before accounts (docs/ACCOUNTS.md, L1)', () => {
  test('an ownerless household is offered to take over, as one of its names or a new one', async () => {
    let owned = false
    const fetchFn = mockApi({
      'GET /api/households/7': () => (owned ? [200, { ...nha7, role: 'owner', member_id: 11 }] : [...notFound]),
      'GET /api/households/7/claim': [200, { id: 7, name: 'Nhà trọ Q7', members: people.slice(0, 2) }],
      'POST /api/households/7/claim': () => {
        owned = true
        return [204]
      },
      'GET /api/households/7/members': [200, people],
    })
    const user = userEvent.setup()
    renderApp(`/households/7#k=${OLD_KEY}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'Nhận Nhà trọ Q7' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Tôi là người mới \(Tiến\)/ })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Võ Việt Tiến' }))
    await user.click(screen.getByRole('button', { name: 'Nhận làm trưởng nhóm' }))

    expect(await screen.findByRole('navigation', { name: 'Mục của nhà' })).toBeInTheDocument()
    const claim = fetchFn.mock.calls.find(([url, init]) => url === '/api/households/7/claim' && init?.method)
    expect(JSON.parse(claim?.[1]?.body as string)).toEqual({ member_id: 11 })
    expect(new Headers(claim?.[1]?.headers).get('X-Household-Key')).toBe(OLD_KEY)
    // The old key leaves the address bar once in
    await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('#k='))
  })

  test('a household that has an owner asks for an invite code instead', async () => {
    mockApi({
      'GET /api/households/7': [...notFound],
      'GET /api/households/7/claim': [409, { error: { code: 'household_has_owner', message: 'owned' } }],
    })
    renderApp(`/households/7#k=${OLD_KEY}`)
    expect(await screen.findByText(/Nhà này đã có trưởng nhóm/)).toBeInTheDocument()
    expect(screen.getByLabelText('Mã mời')).toBeInTheDocument()
  })

  test('a wrong old key is like a household that does not exist', async () => {
    mockApi({ 'GET /api/households/7': [...notFound], 'GET /api/households/7/claim': [...notFound] })
    renderApp(`/households/7#k=${OLD_KEY}`)
    expect(await screen.findByText(/Có thể nhà đã bị xoá/)).toBeInTheDocument()
  })

  test('a member opening an old link simply opens the household', async () => {
    const fetchFn = mockApi(house)
    renderApp(`/households/7#k=${OLD_KEY}`)
    expect(await screen.findByRole('navigation', { name: 'Mục của nhà' })).toBeInTheDocument()
    expect(fetchFn.mock.calls.some(([url]) => String(url).endsWith('/claim'))).toBe(false)
  })
})
