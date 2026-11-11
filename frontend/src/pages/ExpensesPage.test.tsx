import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Expense, ExpenseInput } from '../api/types'
import { today } from '../lib/date'
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

/** Presses a button that asks first (components/InlineConfirm.tsx), then the action in its question. */
async function confirmed(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement) {
  await user.click(trigger)
  const question = document.querySelector('.inline-confirm') as HTMLElement
  await user.click(within(question).getAllByRole('button')[0])
}

test('lists the expenses with who paid', async () => {
  api()
  renderApp('/households/7/expenses')
  expect(await list().findByText('Tiền điện')).toBeInTheDocument()
  expect(list().getByText(/^Tiến trả · chia đều 2 người/)).toBeInTheDocument()
})

// #228 review: saving an expense refreshes the house, but must not fetch every photo again
test('saving an expense does not fetch the photos again', async () => {
  const photo = 'data:image/jpeg;base64,/9j/AA=='
  const withPhoto = [{ ...members[0], role: 'owner', user_id: 9, photo_version: 'aaaaaaaaaaaa' }, members[1]]
  const fetchFn = api(
    { 'GET /api/households/7/photos': [200, { photos: [{ member_id: 1, version: 'aaaaaaaaaaaa', data: photo }] }] },
    withPhoto,
  )
  const user = userEvent.setup()
  renderApp('/households/7/expenses')
  await waitFor(() => expect(document.querySelector(`img[src="${photo}"]`)).not.toBeNull())

  await user.type(await screen.findByLabelText('Nội dung'), 'Ăn tối')
  await user.type(screen.getByLabelText('Số tiền'), '240k')
  await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))
  expect(await list().findByText('Ăn tối')).toBeInTheDocument()

  const calls = (path: string) => fetchFn.mock.calls.filter(([url]) => url === path).length
  await waitFor(() => expect(calls('/api/households/7/members')).toBeGreaterThan(1)) // the house did refresh
  expect(calls('/api/households/7/photos')).toBe(1)
  expect(document.querySelector(`img[src="${photo}"]`)).not.toBeNull()
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
  expect(await screen.findByRole('heading', { name: 'Ghi khoản chi' })).toBeInTheDocument()
  expect(list().getByText(/500\.000/)).toBeInTheDocument()
})

test('cancel leaves the expense as it was', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  await user.click(await screen.findByRole('button', { name: 'Sửa Tiền điện' }))
  await user.click(screen.getByRole('button', { name: 'Huỷ' }))

  expect(screen.getByRole('heading', { name: 'Ghi khoản chi' })).toBeInTheDocument()
  expect(fetchFn.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
})

test('deleting asks first, then takes the expense off the list', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  await confirmed(user, await screen.findByRole('button', { name: 'Xoá Tiền điện' }))

  // Asked in place, never with the browser's dialog (plan item 8)
  expect(window.confirm).not.toHaveBeenCalled()
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

  // In the save area, with the split that it is about (specs/011, FR-002)
  expect(await screen.findByText(/^Chưa lưu được: Có người không thuộc nhà này/)).toBeInTheDocument()
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
  await confirmed(user, screen.getByRole('button', { name: 'Xoá Tiền điện' }))

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

test('named amounts fill Tự chia and are saved as those shares (specs/009-ai-custom-split)', async () => {
  const custom = {
    draft: {
      ...lau.draft,
      split: {
        type: 'custom',
        shares: [
          { member_id: 1, amount: 140_000 },
          { member_id: 2, amount: 100_000 },
        ],
        rest_to: 2,
        rest_amount: 100_000,
        rest_to_payer: true,
      },
    },
    warnings: [],
  }
  const fetchFn = api({ 'POST /api/households/7/ai/parse-expense': [200, custom] })
  const user = userEvent.setup()
  renderApp('/households/7/expenses')

  await user.type(await screen.findByLabelText('Câu mô tả khoản chi'), 'lẩu 240k Minh trả, Tiến 140k')
  await user.click(screen.getByRole('button', { name: 'Điền giúp' }))
  expect(await screen.findByText(/^Đã điền: Lẩu/)).toBeInTheDocument()
  expect(screen.getByLabelText('Phần của Tiến')).toHaveValue('140000')
  expect(screen.getByText(/tính cho Minh \(người trả\)/)).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))
  expect(await list().findByText('Lẩu')).toBeInTheDocument()
  const post = fetchFn.mock.calls.find(
    ([url, init]) => url === '/api/households/7/expenses' && init?.method === 'POST',
  )
  expect(JSON.parse(post?.[1]?.body as string).split).toEqual({
    type: 'custom',
    shares: [
      { member_id: 1, amount: 140_000 },
      { member_id: 2, amount: 100_000 },
    ],
  })
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
  expect(await screen.findByText(/Gõ nhanh đã đạt giới hạn lượt dùng/)).toBeInTheDocument()
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
    expect(tien).toHaveTextContent(/Tiếnbạn.*đã chi 450\.000đ.*225\.000đ.*phần chia/)
    expect(minh).toHaveTextContent(/Minh.*đã chi 100\.000đ.*325\.000đ.*phần chia/)
  })

  test('a payer keeps what they paid, not what they only share in; Bỏ lọc clears it (owner, 07/11)', async () => {
    three()
    const user = userEvent.setup()
    renderApp('/households/7/expenses')
    await list().findByText('Tiền nhà tháng 9')

    // Tiến paid the electricity and only shares the rent
    await user.selectOptions(list().getByLabelText('Người trả'), 'Tiến')
    expect(list().getByText('Tiền điện')).toBeInTheDocument()
    expect(list().queryByText('Tiền nước')).not.toBeInTheDocument()
    expect(list().queryByText('Tiền nhà tháng 9')).not.toBeInTheDocument()

    await user.selectOptions(list().getByLabelText('Tháng'), '10/2026')
    await user.selectOptions(list().getByLabelText('Người trả'), 'Minh')
    expect(list().getByText('Tiền nước')).toBeInTheDocument()
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

    await user.selectOptions(list().getByLabelText('Người trả'), 'Tiến')

    expect(list().getByText('Không có khoản chi nào khớp bộ lọc.')).toBeInTheDocument()
    await user.click(list().getByRole('button', { name: 'Xem tất cả' }))
    expect(list().getByText('Tiền nước')).toBeInTheDocument()
  })

  test('deleting the last expense of the chosen month keeps it, and Bỏ lọc clears it', async () => {
    api()
    const user = userEvent.setup()
    renderApp('/households/7/expenses')
    await list().findByText('Tiền điện')
    await user.selectOptions(list().getByLabelText('Tháng'), '10/2026')

    await user.click(list().getByText('Tiền điện'))
    await confirmed(user, list().getByRole('button', { name: 'Xoá Tiền điện' }))

    const empty = await list().findByText('Tháng 10/2026 chưa có khoản chi nào.')
    expect(list().getByLabelText('Tháng')).toHaveValue('2026-10')
    await user.click(within(empty).getByRole('button', { name: 'Bỏ lọc' }))

    // No filter left, and the house really has nothing to show
    expect(list().queryByText('Tháng 10/2026 chưa có khoản chi nào.')).not.toBeInTheDocument()
    expect(list().getByText('Chưa có khoản chi nào. Ghi khoản đầu tiên ở trên.')).toBeInTheDocument()
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
  // cell from the description to Số tiền, and an empty actions cell. This test's computer is under 1408 px,
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

test('a month with no expense in the hand-off keeps the filter and says it is empty', async () => {
  api()
  renderApp({ pathname: '/households/7/expenses', state: { month: '2026-03' } })

  const empty = await screen.findByText('Tháng 3/2026 chưa có khoản chi nào.')
  expect(screen.getByRole('combobox', { name: 'Tháng' })).toHaveValue('2026-03')
  expect(list().queryByText('Tiền điện')).not.toBeInTheDocument()
  // What is left is a way out, not a dead end
  await userEvent.click(within(empty).getByRole('button', { name: 'Bỏ lọc' }))
  expect(list().getByText('Tiền điện')).toBeInTheDocument()
})

// Khoản chi định kỳ (specs/007-recurring-expenses)
describe('recurring expenses in Chi tiêu', () => {
  const rent = {
    id: 7, household_id: 7, description: 'Tiền nhà', category: 'rent', payer_id: 2, member_ids: [1, 2],
    amount: 3_000_000, day: 1, created_by: 9, created_at: '',
  }
  const recordedRent = { ...saved(20, {
    description: 'Tiền nhà', amount: 3_000_000, payer_id: 2, spent_at: today(),
    split: { type: 'equal', member_ids: [1, 2] },
  }), recurring_item_id: 7 }
  const sentBodies = (fetchFn: ReturnType<typeof api>, method: string) =>
    fetchFn.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === method)
      .map(([, init]) => JSON.parse((init as RequestInit).body as string))

  test('Ghi tháng này opens the form filled from the item, and Lưu records it as that month', async () => {
    const fetchFn = api({ 'GET /api/households/7/recurring': [200, [rent]] })
    const user = userEvent.setup()
    renderApp({ pathname: '/households/7/expenses', state: { recordItem: 7 } })
    expect(await screen.findByDisplayValue('Tiền nhà')).toBeInTheDocument()
    expect(screen.getByLabelText('Số tiền')).toHaveValue('3000000')
    expect(screen.getByText(/^Đang ghi kỳ/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))
    await waitFor(() => expect(sentBodies(fetchFn, 'POST')).toHaveLength(1))
    expect(sentBodies(fetchFn, 'POST')[0]).toMatchObject({ recurring_item_id: 7, payer_id: 2, category: 'rent' })
    // Back to an ordinary new expense
    await waitFor(() => expect(screen.queryByText(/^Đang ghi kỳ/)).not.toBeInTheDocument())
  })

  test('a month already recorded: said with the month and the item, the form keeps what was typed', async () => {
    api({
      'GET /api/households/7/recurring': [200, [rent]],
      'POST /api/households/7/expenses': [409, { error: {
        code: 'recurring_month_taken', message: 'x', details: { expense_id: 10 },
      } }],
    })
    const user = userEvent.setup()
    renderApp({ pathname: '/households/7/expenses', state: { recordItem: 7 } })
    await screen.findByDisplayValue('Tiền nhà')
    await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))
    const [year, month] = today().split('-')
    const alert = await screen.findByText(`Kỳ ${Number(month)}/${year} của Tiền nhà đã có người ghi.`)
    expect(screen.getByLabelText('Nội dung')).toHaveValue('Tiền nhà')
    await user.click(within(alert).getByRole('button', { name: 'Xem khoản đã ghi' }))
    expect(await list().findByText('Tiền điện')).toBeInTheDocument()
  })

  test('editing a recorded expense never sends the link, and a taken month is said the same way', async () => {
    // "Tiền phòng": "Tiền nhà" is also a category name on the page
    const fetchFn = api({
      'GET /api/households/7/expenses': [200, [{ ...recordedRent, description: 'Tiền phòng' }]],
      'GET /api/households/7/recurring': [200, [{ ...rent, description: 'Tiền phòng' }]],
      'PUT /api/expenses/20': [409, { error: {
        code: 'recurring_month_taken', message: 'x', details: { expense_id: 21 },
      } }],
    })
    const user = userEvent.setup()
    renderApp('/households/7/expenses')
    await user.click(await list().findByText('Tiền phòng'))
    await user.click(await screen.findByRole('button', { name: 'Sửa Tiền phòng' }))
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await screen.findByText(/^Kỳ .* của Tiền phòng đã có người ghi\.$/)
    expect(sentBodies(fetchFn, 'PUT')[0]).not.toHaveProperty('recurring_item_id')
    expect(screen.queryByRole('checkbox', { name: 'Lặp lại hằng tháng' })).not.toBeInTheDocument()
  })

  test('Khoản định kỳ lists the items; the creator can stop one', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const fetchFn = api({
      'GET /api/households/7/recurring': [200, [rent]],
      'POST /api/recurring/7/stop': [204],
    })
    const user = userEvent.setup()
    renderApp('/households/7/expenses')
    await user.click(await screen.findByText('Khoản định kỳ (1)'))
    await confirmed(user, screen.getByRole('button', { name: 'Ngừng lặp Tiền nhà' }))
    await waitFor(() =>
      expect(fetchFn.mock.calls.some(([url, init]) => url === '/api/recurring/7/stop' && init?.method === 'POST')).toBe(true),
    )
    expect(await screen.findByText('Đã ngừng lặp Tiền nhà.')).toBeInTheDocument()
  })

  // Pressing Lưu twice fast (specs/011 review): the button is only disabled after the page re-renders
  test('a double click on Lưu khoản chi records one expense', async () => {
    const fetchFn = api()
    const user = userEvent.setup()
    renderApp('/households/7/expenses')
    await user.type(await screen.findByLabelText('Nội dung'), 'Lẩu')
    await user.type(screen.getByLabelText('Số tiền'), '300000')
    await user.dblClick(screen.getByRole('button', { name: 'Lưu khoản chi' }))
    // The list shows it once (with an instant answer the second click can meet the emptied form, whose
    // field error then takes the "Đã lưu" toast away: specs/018, FR-012)
    expect(await list().findByText('Lẩu')).toBeInTheDocument()
    expect(sentBodies(fetchFn, 'POST').filter((body) => body && 'description' in body)).toHaveLength(1)
  })

  // specs/011-first-impressions, US6
  test('a stop that fails says so under that item only; trying again and succeeding clears it', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    let tries = 0
    let answerInternet: (reply: [number, unknown?]) => void = () => {}
    api({
      'GET /api/households/7/recurring': [200, [rent, { ...rent, id: 8, description: 'Internet' }]],
      'POST /api/recurring/7/stop': () => (++tries === 1 ? [503, { error: { code: 'x', message: 'Máy chủ đang bận.' } }] : [204]),
      'POST /api/recurring/8/stop': () => new Promise((resolve) => (answerInternet = resolve)),
    })
    const user = userEvent.setup()
    renderApp('/households/7/expenses')
    await user.click(await screen.findByText('Khoản định kỳ (2)'))
    await confirmed(user, screen.getByRole('button', { name: 'Ngừng lặp Internet' }))
    await confirmed(user, screen.getByRole('button', { name: 'Ngừng lặp Tiền nhà' }))
    // Each its own wait: Internet still waits, Tiền nhà has answered
    expect(screen.getByRole('button', { name: 'Ngừng lặp Internet' })).toHaveAttribute('aria-disabled', 'true')
    const fold = screen.getByText('Khoản định kỳ (2)').closest('details') as HTMLElement
    const [rentRow, internetRow] = within(fold).getAllByRole('listitem')
    await waitFor(() => expect(rentRow).toHaveTextContent('Chưa xác nhận được là đã ngừng lặp. Máy chủ đang bận.'))
    expect(internetRow).not.toHaveTextContent('Chưa xác nhận')
    expect(screen.getByRole('button', { name: 'Ngừng lặp Tiền nhà' })).not.toHaveAttribute('aria-disabled')
    await act(async () => answerInternet([204]))

    await confirmed(user, screen.getByRole('button', { name: 'Ngừng lặp Tiền nhà' }))
    expect(await screen.findByText('Đã ngừng lặp Tiền nhà.')).toBeInTheDocument()
    expect(rentRow).not.toHaveTextContent('Chưa xác nhận')
  })

  test('an answer that comes after leaving the page says nothing', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    let answer: (reply: [number, unknown?]) => void = () => {}
    api({
      'GET /api/households/7/recurring': [200, [rent]],
      'POST /api/recurring/7/stop': () => new Promise((resolve) => (answer = resolve)),
    })
    const user = userEvent.setup()
    renderApp('/households/7/expenses')
    await user.click(await screen.findByText('Khoản định kỳ (1)'))
    await confirmed(user, screen.getByRole('button', { name: 'Ngừng lặp Tiền nhà' }))
    await user.click(screen.getByRole('link', { name: 'Tổng quan' }))
    await act(async () => answer([204]))
    expect(screen.queryByText('Đã ngừng lặp Tiền nhà.')).toBeNull()
  })
})

// specs/018-safe-saves, User Story 1: a failed save says only what is known, and the form keeps everything
describe('saving with no connection, or with no answer', () => {
  afterEach(() => vi.restoreAllMocks())

  async function fillAndSave() {
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Nội dung'), 'Đi chợ')
    await user.type(screen.getByLabelText('Số tiền'), '347,5k')
    await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))
  }

  test('offline: nothing is sent, the line says so, and every field stays', async () => {
    const fetchFn = api()
    renderApp('/households/7/expenses')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await fillAndSave()
    expect(await screen.findByText('Chưa lưu được: bạn đang mất mạng. Khoản chi này chưa được lưu.')).toBeInTheDocument()
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    expect(screen.getByLabelText('Nội dung')).toHaveValue('Đi chợ')
    expect(screen.getByLabelText('Số tiền')).toHaveValue('347,5k')
  })

  test('sent with no answer: the result is unknown, said alone, and the form keeps its values', async () => {
    api({ 'POST /api/households/7/expenses': () => Promise.reject(new TypeError('Failed to fetch')) })
    renderApp('/households/7/expenses')
    await fillAndSave()
    // Pressing again is safe since specs/020-no-double-save (US4)
    const line = 'Chưa nhận được kết quả. Có thể khoản chi đã được lưu; bấm Lưu lại cũng không ghi trùng.'
    expect(await screen.findByText(line)).toBeInTheDocument()
    expect(screen.queryByText(/Chưa lưu được: Chưa nhận được/)).toBeNull()
    expect(screen.getByLabelText('Nội dung')).toHaveValue('Đi chợ')
  })

  test('a save is done when the write is, even if the refresh after it hangs (FR-010)', async () => {
    let lists = 0
    api({
      'GET /api/households/7/expenses': () => {
        lists += 1
        return lists === 1 ? [200, [electricity]] : new Promise(() => {})
      },
    })
    renderApp('/households/7/expenses')
    await fillAndSave()
    expect(await screen.findByText(/^Đã lưu: Đi chợ/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Nội dung')).toHaveValue(''))
    expect(screen.getByRole('button', { name: 'Lưu khoản chi' })).not.toHaveAttribute('aria-disabled', 'true')
  })
})

// Plan item 8 (review 12/11, B08): a deleted expense can be put back from its toast
describe('Hoàn tác after Xoá', () => {
  test('records the same expense again, with its content and a draft of its own', async () => {
    const fetchFn = api()
    const user = userEvent.setup()
    renderApp('/households/7/expenses')
    await confirmed(user, await screen.findByRole('button', { name: 'Xoá Tiền điện' }))
    const toast = (await screen.findByText('Đã xoá "Tiền điện".')).closest('.toast') as HTMLElement
    await user.click(within(toast).getByRole('button', { name: 'Hoàn tác' }))
    expect(await screen.findByText('Đã ghi lại "Tiền điện".')).toBeInTheDocument()
    expect(await list().findByText('Tiền điện')).toBeInTheDocument()
    const posts = fetchFn.mock.calls.filter(([url, init]) => url === '/api/households/7/expenses' && init?.method === 'POST')
    expect(posts).toHaveLength(1)
    const body = JSON.parse(posts[0][1]?.body as string)
    expect(body).toEqual({
      description: 'Tiền điện',
      amount: 450_000,
      payer_id: 1,
      spent_at: '2026-10-18',
      source: 'manual',
      category: 'other',
      split: { type: 'equal', member_ids: [1, 2] },
      draft_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
  })

  test('no answer: the toast stays with Thử lại, which sends the same draft (review of #300)', async () => {
    let calls = 0
    const fetchFn = api({
      'POST /api/households/7/expenses': (body) =>
        ++calls === 1 ? Promise.reject(new TypeError('Failed to fetch')) : [200, saved(12, body as ExpenseInput)],
    })
    const user = userEvent.setup()
    renderApp('/households/7/expenses')
    await confirmed(user, await screen.findByRole('button', { name: 'Xoá Tiền điện' }))
    const deleted = (await screen.findByText('Đã xoá "Tiền điện".')).closest('.toast') as HTMLElement
    await user.click(within(deleted).getByRole('button', { name: 'Hoàn tác' }))
    const line = 'Chưa nhận được kết quả. Có thể khoản chi đã được ghi lại; bấm Thử lại cũng không ghi trùng.'
    const unknown = (await screen.findByText(line)).closest('.toast') as HTMLElement
    // Sticky: it has Đóng, and never times out on its own
    expect(within(unknown).getByRole('button', { name: 'Đóng' })).toBeInTheDocument()
    await user.click(within(unknown).getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('Đã ghi lại "Tiền điện".')).toBeInTheDocument()
    const posts = fetchFn.mock.calls
      .filter(([url, init]) => url === '/api/households/7/expenses' && init?.method === 'POST')
      .map(([, init]) => JSON.parse(init?.body as string) as ExpenseInput)
    expect(posts).toHaveLength(2)
    expect(posts[1].draft_id).toBe(posts[0].draft_id)
  })

  test('a refusal says why', async () => {
    api({
      'POST /api/households/7/expenses': [
        422,
        { error: { code: 'member_without_account', message: 'x' } },
      ],
    })
    const user = userEvent.setup()
    renderApp('/households/7/expenses')
    await confirmed(user, await screen.findByRole('button', { name: 'Xoá Tiền điện' }))
    const toast = (await screen.findByText('Đã xoá "Tiền điện".')).closest('.toast') as HTMLElement
    await user.click(within(toast).getByRole('button', { name: 'Hoàn tác' }))
    expect(await screen.findByText(/^Chưa ghi lại được:/)).toBeInTheDocument()
  })
})

// specs/020-no-double-save, User Story 1: one draft, one expense, however often Lưu is pressed
describe('pressing Lưu again', () => {
  const posts = (fetchFn: ReturnType<typeof api>) =>
    fetchFn.mock.calls
      .filter(([url, init]) => init?.method === 'POST' && String(url).endsWith('/expenses'))
      .map(([, init]) => JSON.parse(init?.body as string) as ExpenseInput)

  async function fillAndSave(user = userEvent.setup(), description = 'Đi chợ') {
    await user.type(await screen.findByLabelText('Nội dung'), description)
    await user.type(screen.getByLabelText('Số tiền'), '347,5k')
    await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))
    return user
  }

  test('after no answer, the same draft is sent again; its answer is a save like any other', async () => {
    let calls = 0
    const fetchFn = api({
      'POST /api/households/7/expenses': (body) => {
        calls += 1
        if (calls === 1) return Promise.reject(new TypeError('Failed to fetch'))
        // The first press had landed: the server gives that expense back (200)
        return [calls === 2 ? 200 : 201, saved(10 + calls, body as ExpenseInput)]
      },
    })
    renderApp('/households/7/expenses')
    const user = await fillAndSave()
    await screen.findByText(/^Chưa nhận được kết quả/)
    await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))
    expect(await screen.findByText(/^Đã lưu: Đi chợ/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Nội dung')).toHaveValue(''))
    // The same values again, after a save: another expense, another draft ("Đi chợ" twice a day)
    await fillAndSave(user)
    await waitFor(() => expect(posts(fetchFn)).toHaveLength(3))
    const [first, again, next] = posts(fetchFn)
    expect(first.draft_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(again.draft_id).toBe(first.draft_id)
    expect(next.draft_id).not.toBe(first.draft_id)
  })

  test('a quick-add fill or a changed field keeps the draft: the server compares it', async () => {
    let calls = 0
    const fetchFn = api({
      'POST /api/households/7/expenses': () => {
        calls += 1
        return calls === 1
          ? Promise.reject(new TypeError('Failed to fetch'))
          : [409, { error: { code: 'draft_already_saved', message: 'x', details: { kind: 'expense', id: 10 } } }]
      },
    })
    renderApp('/households/7/expenses')
    const user = await fillAndSave()
    await screen.findByText(/^Chưa nhận được kết quả/)
    await user.clear(screen.getByLabelText('Số tiền'))
    await user.type(screen.getByLabelText('Số tiền'), '400k')
    await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))
    await screen.findByText(/^Khoản chi này đã được lưu rồi/)
    const [first, changed] = posts(fetchFn)
    expect(changed.draft_id).toBe(first.draft_id)
    expect(changed.amount).toBe(400_000)
  })

  test('"đã được lưu rồi": the form keeps what was typed; Xem shows it; Ghi thành khoản mới saves a new draft', async () => {
    let calls = 0
    const fetchFn = api({
      'POST /api/households/7/expenses': (body) => {
        calls += 1
        return calls === 1
          ? [409, { error: { code: 'draft_already_saved', message: 'x', details: { kind: 'expense', id: 10 } } }]
          : [201, saved(12, body as ExpenseInput)]
      },
    })
    renderApp('/households/7/expenses')
    const user = await fillAndSave()
    const line = await screen.findByText(
      'Khoản chi này đã được lưu rồi, có thể khác những gì đang nhập. Xem trong danh sách rồi sửa nếu cần.',
    )
    expect(line).toHaveAttribute('role', 'alert')
    expect(screen.getByLabelText('Nội dung')).toHaveValue('Đi chợ')
    // No "Chưa lưu được" in the form: the line is the whole message
    expect(screen.queryByText(/Chưa lưu được/)).toBeNull()
    await user.click(within(line).getByRole('button', { name: 'Xem' }))
    await waitFor(() => expect(document.querySelector('[data-expense="10"]')).toHaveClass('just-saved'))
    await user.click(within(line).getByRole('button', { name: 'Ghi thành khoản mới' }))
    // The pressed button goes with its line: the focus waits on Lưu (review of #297)
    expect(screen.getByRole('button', { name: /^(Lưu khoản chi|Đang lưu)/ })).toHaveFocus()
    expect(await screen.findByText(/^Đã lưu: Đi chợ/)).toBeInTheDocument()
    const [first, asNew] = posts(fetchFn)
    expect(asNew.draft_id).not.toBe(first.draft_id)
    expect(asNew.amount).toBe(first.amount)
    expect(screen.queryByText(/^Khoản chi này đã được lưu rồi/)).toBeNull()
  })
})

// specs/018-safe-saves, User Story 2: from the moment it is sent until it ends, what is saved cannot change
describe('a save on its way', () => {
  test('nothing typed, picked or filled in changes the form, and a failure gives back exactly what was sent', async () => {
    let answer: (reply: [number, unknown?]) => void = () => {}
    let ai: (reply: [number, unknown?]) => void = () => {}
    const fetchFn = api({
      'POST /api/households/7/expenses': () => new Promise((resolve) => (answer = resolve)),
      'POST /api/households/7/ai/parse-expense': () => new Promise((resolve) => (ai = resolve)),
    })
    const user = userEvent.setup()
    renderApp('/households/7/expenses')

    // A sentence is being read when Lưu is pressed
    await user.type(await screen.findByLabelText('Câu mô tả khoản chi'), 'lẩu 240k Minh trả')
    await user.click(screen.getByRole('button', { name: 'Điền giúp' }))
    await user.type(screen.getByLabelText('Nội dung'), 'Đi chợ')
    await user.type(screen.getByLabelText('Số tiền'), '120k')
    await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))

    const description = screen.getByLabelText('Nội dung')
    expect(description).toHaveAttribute('readonly')
    expect(description.closest('form')).toHaveAttribute('aria-busy', 'true')
    await user.type(description, ' nữa')
    expect(description).toHaveValue('Đi chợ')
    expect(description).toHaveFocus() // locking never throws the focus away
    // The AI answers meanwhile: the form being saved is not filled in
    ai([200, lau])
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByLabelText('Nội dung')).toHaveValue('Đi chợ')
    expect(screen.getByLabelText('Câu mô tả khoản chi')).toHaveValue('lẩu 240k Minh trả')

    answer([500, { error: { code: 'error', message: 'x' } }])
    await waitFor(() => expect(screen.getByLabelText('Nội dung')).not.toHaveAttribute('readonly'))
    expect(screen.getByLabelText('Nội dung')).toHaveValue('Đi chợ')
    expect(screen.getByLabelText('Số tiền')).toHaveValue('120k')
    const posts = fetchFn.mock.calls.filter(([url, init]) => url === '/api/households/7/expenses' && init?.method === 'POST')
    expect(JSON.parse(posts[0]?.[1]?.body as string)).toMatchObject({ description: 'Đi chợ', amount: 120_000 })
  })

  test('a field error before sending locks nothing', async () => {
    api()
    const user = userEvent.setup()
    renderApp('/households/7/expenses')
    await user.type(await screen.findByLabelText('Nội dung'), 'Đi chợ')
    await user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))
    expect(screen.getByLabelText('Số tiền')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Nội dung').closest('form')).not.toHaveAttribute('aria-busy')
  })
})
