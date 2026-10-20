import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { Expense, ExpenseInput } from '../api/types'
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
]

function saved(id: number, input: ExpenseInput): Expense {
  const { split } = input
  const shares =
    split.type === 'equal'
      ? split.member_ids.map((member_id) => ({
          member_id,
          amount: input.amount / split.member_ids.length,
        }))
      : split.shares
  return {
    id,
    household_id: 7,
    created_at: '',
    source: input.source ?? 'manual',
    split_type: input.split.type,
    shares,
    description: input.description,
    amount: input.amount,
    payer_id: input.payer_id,
    spent_at: input.spent_at,
  }
}

const electricity = saved(10, {
  description: 'Tiền điện',
  amount: 450_000,
  payer_id: 1,
  spent_at: '2026-10-18',
  split: { type: 'equal', member_ids: [1, 2] },
})

/** A fake API that remembers changes, so the page's refetches see them. */
function api(extra: Parameters<typeof mockApi>[0] = {}, memberList = members) {
  let expenses = [electricity]
  return mockApi({
    'GET /api/households/7': [200, household],
    'GET /api/households/7/members': [200, memberList],
    'GET /api/households/7/expenses': () => [200, expenses],
    'POST /api/households/7/expenses': (body) => {
      const expense = saved(11, body as ExpenseInput)
      expenses = [expense, ...expenses]
      return [201, expense]
    },
    'PUT /api/expenses/10': (body) => {
      const expense = saved(10, body as ExpenseInput)
      expenses = expenses.map((e) => (e.id === 10 ? expense : e))
      return [200, expense]
    },
    'DELETE /api/expenses/10': () => {
      expenses = expenses.filter((e) => e.id !== 10)
      return [204]
    },
    ...extra,
  })
}

const list = () => within(screen.getByRole('region', { name: 'Các khoản chi' }))

test('lists the expenses with who paid', async () => {
  api()
  renderApp('/households/7/expenses')
  expect(await list().findByText('Tiền điện')).toBeInTheDocument()
  expect(list().getByText('Tiến')).toBeInTheDocument()
})

test('adding an expense puts it on the list and clears the form', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  await user.type(await screen.findByLabelText('Nội dung'), 'Ăn tối')
  await user.type(screen.getByLabelText('Số tiền (đồng)'), '240k')
  await user.click(screen.getByRole('button', { name: 'Thêm khoản chi' }))

  expect(await list().findByText('Ăn tối')).toBeInTheDocument()
  expect(screen.getByLabelText('Nội dung')).toHaveValue('')
  const post = fetchFn.mock.calls.find(([, init]) => init?.method === 'POST')
  expect(JSON.parse(post?.[1]?.body as string)).toMatchObject({
    description: 'Ăn tối',
    amount: 240_000,
    split: { type: 'equal', member_ids: [1, 2] },
  })
})

test('editing fills the form with the expense and saves it with PUT', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  await user.click(await screen.findByRole('button', { name: 'Sửa Tiền điện' }))
  expect(screen.getByRole('heading', { name: 'Sửa: Tiền điện' })).toBeInTheDocument()
  const amount = screen.getByLabelText('Số tiền (đồng)')
  expect(amount).toHaveValue('450000')

  await user.clear(amount)
  await user.type(amount, '500000')
  await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))

  // Back to adding, and the list shows the new amount
  expect(await screen.findByRole('heading', { name: 'Thêm khoản chi' })).toBeInTheDocument()
  expect(list().getByText(/500\.000/)).toBeInTheDocument()
})

test('cancel leaves the expense as it was', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  await user.click(await screen.findByRole('button', { name: 'Sửa Tiền điện' }))
  await user.click(screen.getByRole('button', { name: 'Hủy' }))

  expect(screen.getByRole('heading', { name: 'Thêm khoản chi' })).toBeInTheDocument()
  expect(fetchFn.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
})

test('deleting asks first, then takes the expense off the list', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  await user.click(await screen.findByRole('button', { name: 'Xoá Tiền điện' }))

  expect(window.confirm).toHaveBeenCalledWith('Xoá khoản "Tiền điện"?')
  await waitFor(() => expect(list().queryByText('Tiền điện')).not.toBeInTheDocument())
  expect(list().getByText(/Chưa có khoản chi nào/)).toBeInTheDocument()
})

test('a split the server refuses is explained in Vietnamese and the form keeps its values', async () => {
  api({
    'POST /api/households/7/expenses': [
      422,
      { error: { code: 'unknown_member', message: 'The payer and everyone in the split must be members' } },
    ],
  })
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  await user.type(await screen.findByLabelText('Nội dung'), 'Ăn tối')
  await user.type(screen.getByLabelText('Số tiền (đồng)'), '240000')
  await user.click(screen.getByRole('button', { name: 'Thêm khoản chi' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Có người không thuộc nhà này.')
  expect(screen.getByLabelText('Nội dung')).toHaveValue('Ăn tối')
})

test('a household without members is told to add them first', async () => {
  api({}, [])
  renderApp('/households/7/expenses')

  expect(await screen.findByText(/Nhà chưa có thành viên/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Thêm thành viên' })).toHaveAttribute(
    'href',
    '/households/7/members',
  )
  expect(screen.queryByLabelText('Nội dung')).not.toBeInTheDocument()
})

test('every change refetches the household data, so balances follow', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7/expenses')
  const listCalls = () =>
    fetchFn.mock.calls.filter(([url, init]) => url === '/api/households/7/expenses' && !init?.method)
      .length

  await screen.findByText('Tiền điện')
  const before = listCalls()
  await user.click(screen.getByRole('button', { name: 'Xoá Tiền điện' }))

  await waitFor(() => expect(listCalls()).toBeGreaterThan(before))
})
