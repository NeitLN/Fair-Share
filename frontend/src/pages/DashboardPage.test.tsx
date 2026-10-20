import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { Settlement, SettlementInput } from '../api/types'
import { mockApi, renderApp } from '../test/renderApp'

beforeEach(() => {
  // The user answers "OK" to "Xoá khoản …?"
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const household = { id: 7, name: 'Nhà 7', created_at: '' }
const members = [
  { id: 1, household_id: 7, name: 'Tiến', created_at: '' },
  { id: 2, household_id: 7, name: 'Minh', created_at: '' },
  { id: 3, household_id: 7, name: 'An', created_at: '' },
]
// Tiến paid 300 000 for the three of them: Minh and An each owe him 100 000
const startNets: Record<number, number> = { 1: 200_000, 2: -100_000, 3: -100_000 }

/** A fake API whose balances follow the settlements, like the real one. */
function api(extra: Parameters<typeof mockApi>[0] = {}, memberList = members) {
  let settlements: Settlement[] = []
  const nets = () => {
    const net = { ...startNets }
    for (const s of settlements) {
      net[s.from_member_id] += s.amount
      net[s.to_member_id] -= s.amount
    }
    return net
  }
  return mockApi({
    'GET /api/households/7': [200, household],
    'GET /api/households/7/members': [200, memberList],
    'GET /api/households/7/balances': () => {
      const net = nets()
      return [
        200,
        {
          balances: memberList.map((m) => ({
            member_id: m.id,
            name: m.name,
            paid: m.id === 1 ? 300_000 : 0,
            owed: 100_000,
            sent: 0,
            received: 0,
            net: net[m.id] ?? 0,
          })),
          suggested: [2, 3]
            .filter((id) => net[id] < 0)
            .map((id) => ({ from_member_id: id, to_member_id: 1, amount: -net[id] })),
        },
      ]
    },
    'GET /api/households/7/settlements': () => [200, settlements],
    'POST /api/households/7/settlements': (body) => {
      const input = body as SettlementInput
      const settlement: Settlement = {
        id: 30 + settlements.length,
        household_id: 7,
        note: input.note ?? null,
        created_at: '',
        ...input,
      }
      settlements = [settlement, ...settlements]
      return [201, settlement]
    },
    'DELETE /api/settlements/30': () => {
      settlements = settlements.filter((s) => s.id !== 30)
      return [204]
    },
    ...extra,
  })
}

const region = (name: string) => within(screen.getByRole('region', { name }))

test('shows who owes whom and how to settle it', async () => {
  api()
  renderApp('/households/7')

  const table = await screen.findByRole('table', { name: 'Số dư của mọi người' })
  expect(within(table).getByRole('row', { name: /Tiến.*được nhận/ })).toBeInTheDocument()
  expect(within(table).getByRole('row', { name: /Minh.*còn nợ/ })).toBeInTheDocument()

  const suggestions = region('Gợi ý chuyển khoản')
  expect(await suggestions.findAllByRole('button', { name: 'Ghi nhận khoản này' })).toHaveLength(2)
  expect(suggestions.getByText(/Minh/).closest('li')).toHaveTextContent(/Minh trả Tiến 100\.000/)
})

test('"Ghi nhận khoản này" records the suggested transfer, paid today', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7')

  const suggestions = region('Gợi ý chuyển khoản')
  await user.click((await suggestions.findAllByRole('button', { name: 'Ghi nhận khoản này' }))[0])

  // One suggestion left, and the payment is on the list
  await waitFor(() =>
    expect(suggestions.getAllByRole('button', { name: 'Ghi nhận khoản này' })).toHaveLength(1),
  )
  expect(
    await region('Các khoản đã trả').findByRole('button', { name: /^Xoá khoản Minh trả Tiến/ }),
  ).toBeInTheDocument()
  const post = fetchFn.mock.calls.find(([, init]) => init?.method === 'POST')
  expect(JSON.parse(post?.[1]?.body as string)).toEqual({
    from_member_id: 2,
    to_member_id: 1,
    amount: 100_000,
    settled_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  })
})

test('after the last suggested payment everyone is settled', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  const suggestions = region('Gợi ý chuyển khoản')
  await user.click((await suggestions.findAllByRole('button', { name: 'Ghi nhận khoản này' }))[0])
  await waitFor(() =>
    expect(suggestions.getAllByRole('button', { name: 'Ghi nhận khoản này' })).toHaveLength(1),
  )
  await user.click(suggestions.getByRole('button', { name: 'Ghi nhận khoản này' }))

  expect(await suggestions.findByText('Mọi người đã cân bằng, không ai nợ ai.')).toBeInTheDocument()
})

test('a payment that is not a suggestion is recorded with the form', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  // The form appears once the members are loaded
  const form = within(await screen.findByRole('region', { name: 'Ghi nhận khoản trả' }))
  await user.selectOptions(form.getByLabelText('Người trả'), 'An')
  await user.selectOptions(form.getByLabelText('Người nhận'), 'Tiến')
  await user.type(form.getByLabelText('Số tiền (đồng)'), '40k')
  await user.click(form.getByRole('button', { name: 'Ghi nhận khoản trả' }))

  const list = region('Các khoản đã trả')
  expect(await list.findByText(/40\.000/)).toBeInTheDocument()
  // An still owes 60 000
  expect(region('Gợi ý chuyển khoản').getByText(/An/).closest('li')).toHaveTextContent(/60\.000/)
})

test('a mistaken payment can be deleted, and the debt comes back', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  const suggestions = region('Gợi ý chuyển khoản')
  await user.click((await suggestions.findAllByRole('button', { name: 'Ghi nhận khoản này' }))[0])
  const list = region('Các khoản đã trả')
  await user.click(await list.findByRole('button', { name: /^Xoá khoản Minh trả Tiến/ }))

  expect(await list.findByText('Chưa ghi nhận khoản trả nào.')).toBeInTheDocument()
  await waitFor(() =>
    expect(suggestions.getAllByRole('button', { name: 'Ghi nhận khoản này' })).toHaveLength(2),
  )
})

test('a failed balances load says so instead of "everyone is settled"', async () => {
  api({
    'GET /api/households/7/balances': [
      503,
      { error: { code: 'database_unavailable', message: 'The database is not reachable right now' } },
    ],
  })
  renderApp('/households/7')

  expect(await region('Ai nợ ai').findByRole('alert')).toHaveTextContent(
    'Máy chủ tạm thời không kết nối được dữ liệu.',
  )
  expect(screen.queryByText(/Mọi người đã cân bằng/)).not.toBeInTheDocument()
})

test('a household without members is sent to the members tab', async () => {
  api({}, [])
  renderApp('/households/7')

  expect(await screen.findByText(/Nhà chưa có thành viên/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Thêm thành viên' })).toHaveAttribute(
    'href',
    '/households/7/members',
  )
})
