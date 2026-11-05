import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Expense, ExpenseInput } from '../api/types'
import { mockApi, renderApp } from '../test/renderApp'
import { onAComputer } from '../test/screen'

beforeEach(() => {
  // The user answers "OK" to "Xoá khoản …?"
  vi.stubGlobal('confirm', vi.fn(() => true))
  // Tiến is signed in (his account has member 1), so he is the default payer
  me = 1
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

// The test account owns the household, so it may change every expense (docs/ACCOUNTS.md)
let me: number | null = 1
const household = { id: 7, name: 'Nhà 7', created_at: '', role: 'owner' }
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
    category: input.category ?? 'other',
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
    'GET /api/households/7': () => [200, { ...household, member_id: me }],
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
  expect(list().getByText(/^Tiến trả · chia đều 2 người/)).toBeInTheDocument()
})

test('adding an expense puts it on the list and clears the form', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  await user.type(await screen.findByLabelText('Nội dung'), 'Ăn tối')
  await user.type(screen.getByLabelText('Số tiền'), '240k')
  await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))

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
  const amount = screen.getByLabelText('Số tiền')
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
  await user.type(screen.getByLabelText('Số tiền'), '240000')
  await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))

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

// --- AI quick add (US-09, US-10) ----------------------------------------------------------------

const lau = {
  draft: {
    description: 'Lẩu',
    amount: 240_000,
    payer_id: 2,
    spent_at: '2026-10-21',
    source: 'ai',
    split: { type: 'equal', member_ids: [1, 2] },
  },
  warnings: [],
}

test('a sentence fills the form, saving records an AI expense and clears the box', async () => {
  const fetchFn = api({ 'POST /api/households/7/ai/parse-expense': [200, lau] })
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  await user.type(await screen.findByLabelText('Câu mô tả khoản chi'), 'lẩu 240k Minh trả')
  await user.click(screen.getByRole('button', { name: 'Điền giúp' }))
  expect(await screen.findByText(/^Đã điền: Lẩu/)).toBeInTheDocument()
  expect(screen.getByLabelText('Nội dung')).toHaveValue('Lẩu')

  await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))

  expect(await list().findByText('Lẩu')).toBeInTheDocument()
  const post = fetchFn.mock.calls.find(
    ([url, init]) => url === '/api/households/7/expenses' && init?.method === 'POST',
  )
  expect(JSON.parse(post?.[1]?.body as string)).toMatchObject({
    description: 'Lẩu',
    amount: 240_000,
    payer_id: 2,
    source: 'ai',
    split: { type: 'equal', member_ids: [1, 2] },
  })
  expect(screen.getByLabelText('Câu mô tả khoản chi')).toHaveValue('')
})

test('when the AI is busy the sentence stays and the expense is saved by hand', async () => {
  const fetchFn = api({
    'POST /api/households/7/ai/parse-expense': [
      429,
      { error: { code: 'ai_rate_limited', message: 'AI quick add is busy right now' } },
    ],
  })
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  await user.type(await screen.findByLabelText('Câu mô tả khoản chi'), 'lẩu 240k Minh trả')
  await user.click(screen.getByRole('button', { name: 'Điền giúp' }))
  expect(await screen.findByText(/Gõ nhanh đang quá tải/)).toBeInTheDocument()
  expect(screen.getByLabelText('Câu mô tả khoản chi')).toHaveValue('lẩu 240k Minh trả')

  await user.type(screen.getByLabelText('Nội dung'), 'Lẩu')
  await user.type(screen.getByLabelText('Số tiền'), '240k')
  await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))

  expect(await list().findByText('Lẩu')).toBeInTheDocument()
  const post = fetchFn.mock.calls.find(
    ([url, init]) => url === '/api/households/7/expenses' && init?.method === 'POST',
  )
  expect(JSON.parse(post?.[1]?.body as string)).toMatchObject({ source: 'manual' })
})

test('the AI box is hidden while an expense is being edited', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  expect(await screen.findByLabelText('Câu mô tả khoản chi')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Sửa Tiền điện' }))
  expect(screen.queryByLabelText('Câu mô tả khoản chi')).not.toBeInTheDocument()
})


test('you are the default payer; without an identity, whoever paid last on this device', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  expect(await screen.findByRole('radio', { name: /^Tiến/ })).toBeChecked()
  await user.type(screen.getByLabelText('Nội dung'), 'Trà sữa')
  await user.type(screen.getByLabelText('Số tiền'), '60k')
  await user.click(screen.getByRole('radio', { name: /^Minh/ }))
  await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))
  await list().findByText('Trà sữa')
  expect(localStorage.getItem('fair-share:last-payer:7')).toBe('2')
  expect(fetchFn).toHaveBeenCalled()
})

test('with no identity, the last payer on this device is chosen for the next expense', async () => {
  me = null
  localStorage.setItem('fair-share:last-payer:7', '1')
  api()
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  expect(await screen.findByRole('radio', { name: /^Tiến/ })).toBeChecked()
  // Minh pays this one: the next expense starts with Minh
  await user.type(screen.getByLabelText('Nội dung'), 'Trà sữa')
  await user.type(screen.getByLabelText('Số tiền'), '60k')
  await user.click(screen.getByRole('radio', { name: /^Minh/ }))
  await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))
  await list().findByText('Trà sữa')
  await waitFor(() => expect(screen.getByRole('radio', { name: /^Minh/ })).toBeChecked())
})

test('with no identity and no last payer, nobody is chosen and saving asks who paid', async () => {
  me = null
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  await user.type(await screen.findByLabelText('Nội dung'), 'Trà sữa')
  await user.type(screen.getByLabelText('Số tiền'), '60k')
  await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))

  expect(screen.getByText('Chọn người trả.')).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /^Tiến/ })).toHaveFocus()
  expect(fetchFn.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
})

test('an AI split for the whole house is flagged beside Cách chia, not in the AI box', async () => {
  api({
    'POST /api/households/7/ai/parse-expense': [
      200,
      { ...lau, warnings: [{ code: 'participants_assumed', message: 'Split between everyone' }] },
    ],
  })
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  await user.type(await screen.findByLabelText('Câu mô tả khoản chi'), 'lẩu 240k Minh trả')
  await user.click(screen.getByRole('button', { name: 'Điền giúp' }))

  const note = await screen.findByText('AI chia cho cả nhà, bạn kiểm tra lại.')
  expect(note).toHaveAttribute('id', 'expense-split-note')
})

// --- Xuất CSV (T-46) ----------------------------------------------------------------------------

test('the CSV button is enabled once there is an expense', async () => {
  api()
  renderApp('/households/7/expenses')

  await list().findByText('Tiền điện')
  expect(screen.getByRole('button', { name: 'Xuất CSV' })).toBeEnabled()
})

test('the CSV button is disabled while the list is empty', async () => {
  api({ 'GET /api/households/7/expenses': [200, []] })
  renderApp('/households/7/expenses')

  await screen.findByText(/Chưa có khoản chi nào/)
  const button = screen.getByRole('button', { name: 'Xuất CSV' })
  expect(button).toBeDisabled()
  expect(button).toHaveAttribute('title', 'Chưa có khoản chi để xuất')
})

describe('filters and month totals (PROJECT_SPEC §3.4)', () => {
  const water = saved(12, {
    description: 'Tiền nước',
    amount: 100_000,
    payer_id: 2,
    spent_at: '2026-10-03',
    split: { type: 'custom', shares: [{ member_id: 2, amount: 100_000 }] },
  })
  const rent = saved(13, {
    description: 'Tiền nhà tháng 9',
    amount: 3_000_000,
    payer_id: 2,
    spent_at: '2026-09-30',
    split: { type: 'equal', member_ids: [1, 2] },
  })
  const three = () => api({ 'GET /api/households/7/expenses': [200, [electricity, water, rent]] })

  test('a month narrows the list and shows what each member paid and owes', async () => {
    three()
    const user = userEvent.setup()
    renderApp('/households/7/expenses')
    await list().findByText('Tiền nhà tháng 9')

    await user.selectOptions(list().getByLabelText('Tháng'), '10/2026')

    expect(list().queryByText('Tiền nhà tháng 9')).not.toBeInTheDocument()
    expect(list().getByText('Tiền điện')).toBeInTheDocument()
    expect(list().getByText('2/3 khoản')).toBeInTheDocument()
    const totals = within(list().getByRole('region', { name: /Tháng 10\/2026: cả nhà chi/ }))
    expect(totals.getByRole('heading')).toHaveTextContent('550.000đ')
    // Tiến paid the electricity (450k) and owes half of it; Minh paid the water and owes all of it
    const [tien, minh] = totals.getAllByRole('listitem')
    expect(tien).toHaveTextContent(/Tiếnbạn.*đã trả 450\.000đ.*225\.000đ.*phần chia/)
    expect(minh).toHaveTextContent(/Minh.*đã trả 100\.000đ.*325\.000đ.*phần chia/)
  })

  test('a member keeps what they paid or share in; with no match, Xem tất cả clears the filter', async () => {
    three()
    const user = userEvent.setup()
    renderApp('/households/7/expenses')
    await list().findByText('Tiền nhà tháng 9')

    await user.selectOptions(list().getByLabelText('Người'), 'Tiến')
    expect(list().queryByText('Tiền nước')).not.toBeInTheDocument()
    expect(list().getByText('Tiền nhà tháng 9')).toBeInTheDocument()

    await user.selectOptions(list().getByLabelText('Tháng'), '10/2026')
    await user.selectOptions(list().getByLabelText('Người'), 'Minh')
    await user.selectOptions(list().getByLabelText('Tháng'), '9/2026')
    expect(list().getByText('Tiền nhà tháng 9')).toBeInTheDocument()

    await user.click(list().getByRole('button', { name: 'Bỏ lọc' }))
    expect(list().getByText('Tiền nước')).toBeInTheDocument()
    expect(list().getByLabelText('Tháng')).toHaveValue('')
    expect(list().getByText('chạm để xem phần từng người, sửa hoặc xoá')).toBeInTheDocument()
  })

  test('a filter that matches nothing says so', async () => {
    api({ 'GET /api/households/7/expenses': [200, [water]] })
    const user = userEvent.setup()
    renderApp('/households/7/expenses')
    await list().findByText('Tiền nước')

    await user.selectOptions(list().getByLabelText('Người'), 'Tiến')

    expect(list().getByText('Không có khoản chi nào khớp bộ lọc.')).toBeInTheDocument()
    await user.click(list().getByRole('button', { name: 'Xem tất cả' }))
    expect(list().getByText('Tiền nước')).toBeInTheDocument()
  })

  test('deleting the last expense of the chosen month drops the month filter', async () => {
    api()
    const user = userEvent.setup()
    renderApp('/households/7/expenses')
    await list().findByText('Tiền điện')
    await user.selectOptions(list().getByLabelText('Tháng'), '10/2026')

    await user.click(list().getByText('Tiền điện'))
    await user.click(list().getByRole('button', { name: 'Xoá Tiền điện' }))

    expect(await list().findByText(/Chưa có khoản chi nào/)).toBeInTheDocument()
    expect(list().queryByLabelText('Tháng')).not.toBeInTheDocument()
  })

  test('no filters before the first expense', async () => {
    api({ 'GET /api/households/7/expenses': [200, []] })
    renderApp('/households/7/expenses')
    expect(await list().findByText(/Chưa có khoản chi nào/)).toBeInTheDocument()
    expect(list().queryByLabelText('Tháng')).not.toBeInTheDocument()
  })
})

test('on a computer the expenses read as a table, and Sửa marks the row it opens in the form', async () => {
  onAComputer()
  api()
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  const table = await screen.findByRole('table')
  expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
    'Ngày',
    'Nội dung',
    'Người trả',
    'Số tiền',
    'Sửa hoặc xoá',
  ])
  const row = within(table).getByRole('row', { name: /Tiền điện/ })
  expect(row).toHaveTextContent(/Tiền điện.*Tiến.*chia đều 2 người · Khác.*450\.000/)
  expect(screen.getByText('mới nhất ở trên')).toBeInTheDocument()

  await user.click(within(row).getByRole('button', { name: 'Sửa Tiền điện' }))
  expect(await screen.findByRole('heading', { name: 'Sửa: Tiền điện' })).toBeInTheDocument()
  expect(row).toHaveClass('editing')
})

test('on a computer the description opens a row with each share', async () => {
  onAComputer()
  api()
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  const table = await screen.findByRole('table')
  const row = within(table).getByRole('row', { name: /Tiền điện/ })
  const split = within(row).getByRole('button', { name: 'Tiền điện' })
  expect(split).toHaveAttribute('aria-expanded', 'false')
  await user.click(split)
  expect(split).toHaveAttribute('aria-expanded', 'true')
  const shares = within(table).getByRole('list', { name: 'Phần của từng người trong Tiền điện' })
  expect(within(shares).getAllByRole('listitem')).toHaveLength(2)
  // Review of #193: the shares end where the Số tiền column ends, so the row is an empty date cell, one
  // cell from the description to Số tiền, and an empty actions cell. This test's computer is under 1280 px,
  // where date and payer fold under the description: the cell spans description and amount
  const cells = (shares.closest('tr') as HTMLTableRowElement).cells
  expect(cells).toHaveLength(3)
  expect(cells[0]).toBeEmptyDOMElement()
  expect(cells[0]).toHaveClass('col-date')
  expect(cells[1]).toHaveAttribute('colspan', '2')
  expect(cells[1]).toContainElement(shares)
  expect(cells[2]).toBeEmptyDOMElement()
  await user.click(split)
  expect(within(table).queryByRole('list', { name: 'Phần của từng người trong Tiền điện' })).not.toBeInTheDocument()
})

test('a saved expense is said in a toast; Xem lifts a filter hiding it and marks its row', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  // Only October is shown; the new expense is today's
  await user.selectOptions(await screen.findByLabelText('Tháng'), '2026-10')
  await user.type(screen.getByLabelText('Nội dung'), 'Ăn tối')
  await user.type(screen.getByLabelText('Số tiền'), '240000')
  await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))

  expect(await screen.findByText('Đã lưu: Ăn tối 240.000đ')).toBeInTheDocument()
  expect(list().queryByText('Ăn tối')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Xem' }))

  const row = (await list().findByText('Ăn tối')).closest('li') as HTMLElement
  expect(row).toHaveClass('just-saved')
  expect(screen.getByLabelText('Tháng')).toHaveValue('')
})

test('a row the user may not change opens to its shares only, with no Sửa or Xoá', async () => {
  me = 2
  api({ 'GET /api/households/7': () => [200, { ...household, role: 'member', member_id: 2 }] })
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  // Since the design review of 05/11 every row opens, to who shares it
  const description = await list().findByText('Tiền điện')
  const row = description.closest('li') as HTMLElement
  await user.click(description)
  expect(within(row).getByRole('list', { name: 'Phần của từng người trong Tiền điện' })).toBeInTheDocument()
  expect(within(row).queryByRole('button', { name: /Sửa/ })).not.toBeInTheDocument()
})

// "Xem các khoản chi tháng này" in a monthly report (specs/004-monthly-report)
test('arriving from a monthly report starts the list on that month', async () => {
  api()
  renderApp({ pathname: '/households/7/expenses', state: { month: '2026-10' } })
  expect(await screen.findByRole('heading', { level: 3, name: 'Tháng 10/2026: cả nhà chi 450.000đ' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Tháng' })).toHaveValue('2026-10')
})

test('a month with no expense in the hand-off is ignored', async () => {
  api()
  renderApp({ pathname: '/households/7/expenses', state: { month: '2026-03' } })
  expect(await screen.findByText('Tiền điện')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 3, name: /cả nhà chi/ })).not.toBeInTheDocument()
})
