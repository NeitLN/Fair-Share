import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { Expense, Notice, Settlement } from '../api/types'
import { setLanguage } from '../i18n'
import { today } from '../lib/date'
import { formatSignedVND as signed, formatVND as plain } from '../lib/money'
import { shiftMonth } from '../lib/monthReport'
import { mockApi, renderApp } from '../test/renderApp'
import { onAComputer } from '../test/screen'

afterEach(() => vi.unstubAllGlobals())

const cur = today().slice(0, 7)
const prev = shiftMonth(cur, -1)
const next = shiftMonth(cur, 1)
const label = (month: string) => `Tháng ${Number(month.slice(5))}/${month.slice(0, 4)}`

const members = [
  { id: 1, household_id: 7, name: 'Tiến', created_at: '' },
  { id: 2, household_id: 7, name: 'Minh', created_at: '' },
  { id: 3, household_id: 7, name: 'An', created_at: '' },
]
const expense = (id: number, spent_at: string, amount: number, payer_id: number) =>
  ({
    id,
    household_id: 7,
    description: `Khoản ${id}`,
    amount,
    payer_id,
    spent_at,
    source: 'manual',
    created_at: '',
    split_type: 'equal',
    shares: [1, 2, 3].map((member_id) => ({ member_id, amount: amount / 3 })),
  }) as Expense
// Last month Minh paid 300 000 for the three and Tiến paid him back 100 000; this month Tiến paid 90 000
const expenses = [expense(2, `${cur}-01`, 90_000, 1), expense(1, `${prev}-05`, 300_000, 2)]
const settlements = [
  { id: 9, household_id: 7, from_member_id: 1, to_member_id: 2, amount: 100_000, settled_at: `${prev}-15`, note: null },
] as Settlement[]
const nets = { 1: 60_000, 2: 70_000, 3: -130_000 } as Record<number, number>

function api({
  expenseList = expenses,
  netOf = nets,
  notices = [] as Notice[],
  extra = {} as Parameters<typeof mockApi>[0],
} = {}) {
  return mockApi({
    'GET /api/households/7': [200, { id: 7, name: 'Nhà 7', created_at: '', role: 'member', member_id: 1 }],
    'GET /api/households/7/members': [200, members],
    'GET /api/households/7/expenses': [200, expenseList],
    'GET /api/households/7/settlements': [200, settlements],
    'GET /api/households/7/notices': [200, notices],
    'GET /api/households/7/balances': [
      200,
      {
        balances: members.map((m) => ({ member_id: m.id, name: m.name, paid: 0, owed: 0, sent: 0, received: 0, net: netOf[m.id] })),
        suggested: [],
      },
    ],
    ...extra,
  })
}

const location = () => screen.getByTestId('location').textContent
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((cell) => cell.textContent)
const table = () => screen.findByRole('table', { name: `Số dư từng người trong ${label(cur).toLowerCase()}` })

describe('this month (US1)', () => {
  test('the total and, for each housemate, start + what moved = end, ending on the balances', async () => {
    onAComputer()
    api()
    renderApp(`/households/7/report/${cur}`)

    const report = await table()
    expect(screen.getByRole('heading', { level: 2, name: `Báo cáo ${label(cur).toLowerCase()}` })).toBeInTheDocument()
    expect(screen.getByText('Cả nhà chi')).toHaveTextContent(`Cả nhà chi ${plain(90_000)}`)
    const rows = within(report).getAllByRole('row')
    // Header, three housemates, the total row
    expect(rows).toHaveLength(5)
    expect(within(rows[0]).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Người',
      'Đầu tháng',
      'Đã chi',
      'Phần chia',
      'Đã trả lại',
      'Đã nhận lại',
      'Cuối tháng',
    ])
    expect(cells(rows[1])).toEqual([signed(0), plain(90_000), plain(30_000), plain(0), plain(0), signed(60_000)])
    expect(cells(rows[2])).toEqual([signed(100_000), plain(0), plain(30_000), plain(0), plain(0), signed(70_000)])
    expect(cells(rows[3])).toEqual([signed(-100_000), plain(0), plain(30_000), plain(0), plain(0), signed(-130_000)])
    // The total row: starts and ends sum to 0, spent = shares = the month's total
    expect(within(rows[4]).getByRole('rowheader')).toHaveTextContent('Cả nhà')
    expect(cells(rows[4])).toEqual([signed(0), plain(90_000), plain(90_000), plain(0), plain(0), signed(0)])
    // You are marked
    expect(rows[1]).toHaveClass('highlighted')
    expect(within(rows[1]).getByText('bạn')).toBeInTheDocument()
    // Read only: no button in the report, only links
    expect(within(report.closest('section') as HTMLElement).queryByRole('button')).not.toBeInTheDocument()
  })

  test('the Tổng quan tab stays marked as the section the report belongs to', async () => {
    onAComputer()
    api()
    renderApp(`/households/7/report/${cur}`)
    await table()
    const tabs = within(screen.getByRole('navigation', { name: 'Mục của nhà' }))
    expect(tabs.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'true')
    expect(tabs.getByRole('link', { name: 'Chi tiêu' })).not.toHaveAttribute('aria-current')
  })

  test('while a request is out, a placeholder and no figure', async () => {
    onAComputer()
    api({ extra: { 'GET /api/households/7/balances': () => new Promise(() => {}) } })
    renderApp(`/households/7/report/${cur}`)
    expect(await screen.findByText('Đang tải báo cáo tháng')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('Cả nhà chi')).not.toBeInTheDocument()
  })

  test('a failed request says so with a retry, and shows no figure', async () => {
    onAComputer()
    let fail = true
    api({
      extra: {
        'GET /api/households/7/expenses': () =>
          fail ? [500, { error: { code: 'internal_error', message: 'x' } }] : [200, expenses],
      },
    })
    renderApp(`/households/7/report/${cur}`)
    const alert = await screen.findByRole('alert')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    fail = false
    await userEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }))
    expect(await table()).toBeInTheDocument()
  })

  test('when the balances differ by 1 đồng it waits instead of showing numbers that disagree', async () => {
    onAComputer()
    const fetches = api({ netOf: { 1: 60_001, 2: 69_999, 3: -130_000 } })
    renderApp(`/households/7/report/${cur}`)
    expect(await screen.findByText('Đang cập nhật…')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    // And it asks again
    await waitFor(() =>
      expect(fetches.mock.calls.filter(([url]) => url === '/api/households/7/balances').length).toBeGreaterThan(1),
    )
  })

  test('a "Tôi đã chuyển" waiting for an answer changes no figure (ACCOUNTS.md S3)', async () => {
    onAComputer()
    api({ notices: [{ from_member_id: 3, to_member_id: 1, amount: 130_000, status: 'sent', created_at: '', version: 1 }] })
    renderApp(`/households/7/report/${cur}`)
    const rows = within(await table()).getAllByRole('row')
    expect(cells(rows[3])).toEqual([signed(-100_000), plain(0), plain(30_000), plain(0), plain(0), signed(-130_000)])
  })
})

describe('other months (US2)', () => {
  test('the previous month ends where this one starts, and is the first: no way further back', async () => {
    onAComputer()
    api()
    renderApp(`/households/7/report/${cur}`)
    await table()
    expect(screen.queryByRole('link', { name: /^Tháng sau/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: `Tháng trước: ${label(prev)}` }))
    await waitFor(() => expect(location()).toBe(`/households/7/report/${prev}`))
    const before = await screen.findByRole('table', { name: `Số dư từng người trong ${label(prev).toLowerCase()}` })
    const rows = within(before).getAllByRole('row')
    expect(screen.getByText('Cả nhà chi')).toHaveTextContent(`Cả nhà chi ${plain(300_000)}`)
    expect(cells(rows[1])).toEqual([signed(0), plain(0), plain(100_000), plain(100_000), plain(0), signed(0)])
    expect(cells(rows[2])).toEqual([signed(0), plain(300_000), plain(100_000), plain(0), plain(100_000), signed(100_000)])
    expect(cells(rows[3])).toEqual([signed(0), plain(0), plain(100_000), plain(0), plain(0), signed(-100_000)])
    expect(screen.queryByRole('link', { name: /^Tháng trước/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: `Tháng sau: ${label(cur)}` })).toBeInTheDocument()
  })

  test('a month with nothing in it says so and carries every balance through', async () => {
    onAComputer()
    const twoBack = shiftMonth(cur, -2)
    const threeBack = shiftMonth(cur, -3)
    // 3 000 for the three, three months back, so the month between is empty
    const early = { ...expense(3, `${threeBack}-10`, 3_000, 3), shares: [1, 2, 3].map((member_id) => ({ member_id, amount: 1_000 })) }
    api({ expenseList: [...expenses, early], netOf: { 1: 59_000, 2: 69_000, 3: -128_000 } })
    renderApp(`/households/7/report/${twoBack}`)
    expect(await screen.findByText('Tháng này không có khoản chi hay khoản trả nào.')).toBeInTheDocument()
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(cells(rows[3])).toEqual([signed(2_000), plain(0), plain(0), plain(0), plain(0), signed(2_000)])
  })

  test.each([
    ['no month', '', cur],
    ['a month that does not exist', '/2026-13', cur],
    ['not a month', '/abc', cur],
    ['a month before the first', '/1999-01', prev],
    ['a month after the last', '/2099-12', cur],
  ])('%s in the address becomes the nearest month, in place', async (_, path, shown) => {
    onAComputer()
    api()
    renderApp(`/households/7/report${path}`)
    await screen.findByRole('table', { name: `Số dư từng người trong ${label(shown).toLowerCase()}` })
    // The address is replaced right after the first render
    await waitFor(() => expect(location()).toBe(`/households/7/report/${shown}`))
  })

  test('something dated next month: this month says so, and next month is the last', async () => {
    onAComputer()
    api({ expenseList: [expense(4, `${next}-02`, 30_000, 2), ...expenses], netOf: { 1: 50_000, 2: 90_000, 3: -140_000 } })
    renderApp(`/households/7/report/${cur}`)
    expect(
      await screen.findByText('Có khoản mang ngày sau tháng này. Số dư cuối tháng có thể khác số dư ở Tổng quan.'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: `Tháng sau: ${label(next)}` }))
    await screen.findByRole('table', { name: `Số dư từng người trong ${label(next).toLowerCase()}` })
    expect(screen.queryByRole('link', { name: /^Tháng sau/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Có khoản ghi ngày sau/)).not.toBeInTheDocument()
  })

  test("the month's expenses are one press away, on Chi tiêu", async () => {
    onAComputer()
    api()
    renderApp(`/households/7/report/${prev}`)
    await userEvent.click(await screen.findByRole('link', { name: 'Xem các khoản chi tháng này' }))
    await waitFor(() => expect(location()).toBe('/households/7/expenses'))
    expect(
      await screen.findByRole('heading', { level: 3, name: `${label(prev)}: cả nhà chi ${plain(300_000)}` }),
    ).toBeInTheDocument()
  })
})

describe('language and screen (US3)', () => {
  test('on a phone, one card per housemate and no table', async () => {
    api()
    renderApp(`/households/7/report/${cur}`)
    const list = await screen.findByRole('list', { name: `Số dư từng người trong ${label(cur).toLowerCase()}` })
    const cards = within(list).getAllByRole('listitem')
    expect(cards).toHaveLength(3)
    expect(cards[2]).toHaveTextContent(`Đầu tháng${signed(-100_000)}`)
    expect(cards[2]).toHaveTextContent(`Cuối tháng${signed(-130_000)}`)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  test('in English', async () => {
    setLanguage('en')
    onAComputer()
    api()
    renderApp(`/households/7/report/${cur}`)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const name = `${months[Number(cur.slice(5)) - 1]} ${cur.slice(0, 4)}`
    expect(await screen.findByRole('heading', { level: 2, name: `${name} report` })).toBeInTheDocument()
    const header = within(await screen.findByRole('table')).getAllByRole('columnheader').map((h) => h.textContent)
    expect(header).toEqual(['Person', 'Start', 'Spent', 'Share', 'Paid back', 'Got back', 'End'])
    expect(screen.getByRole('link', { name: "See this month's expenses" })).toBeInTheDocument()
  })
})

// Chi theo danh mục (specs/005-expense-categories)
describe('spent by category (US2 of spec 005)', () => {
  const tagged = (category: Expense['category'], e: Expense) => ({ ...e, category })
  const withCategories = [
    tagged('food', expense(5, `${cur}-02`, 60_000, 2)),
    tagged('utilities', expense(2, `${cur}-01`, 90_000, 1)),
    tagged('rent', expense(1, `${prev}-05`, 300_000, 2)),
  ]
  const netsWith = { 1: 40_000, 2: 110_000, 3: -150_000 }

  test("under the month's lines, largest first, adding up to Cả nhà chi", async () => {
    onAComputer()
    api({ expenseList: withCategories, netOf: netsWith })
    renderApp(`/households/7/report/${cur}`)
    const chart = within(
      (await screen.findByRole('heading', { level: 3, name: 'Chi theo danh mục' })).closest('section') as HTMLElement,
    )
    expect(screen.getByText('Cả nhà chi')).toHaveTextContent(`Cả nhà chi ${plain(150_000)}`)
    expect(chart.getAllByRole('link').map((l) => l.getAttribute('aria-label'))).toEqual([
      `Điện, nước, mạng: ${plain(90_000)}, chiếm 60% tổng chi trong tháng`,
      `Ăn uống: ${plain(60_000)}, chiếm 40% tổng chi trong tháng`,
    ])
  })

  test('a line opens Chi tiêu on that month and category', async () => {
    onAComputer()
    api({ expenseList: withCategories, netOf: netsWith })
    renderApp(`/households/7/report/${prev}`)
    await userEvent.click(await screen.findByRole('link', { name: /^Tiền nhà:/ }))
    await waitFor(() => expect(location()).toBe('/households/7/expenses'))
    expect(await screen.findByLabelText('Danh mục')).toHaveValue('rent')
    expect(screen.getByLabelText('Tháng')).toHaveValue(prev)
  })

  test('no chart for a month with nothing in it', async () => {
    onAComputer()
    const twoBack = shiftMonth(cur, -2)
    const early = { ...expense(3, `${shiftMonth(cur, -3)}-10`, 3_000, 3), shares: [1, 2, 3].map((member_id) => ({ member_id, amount: 1_000 })) }
    api({ expenseList: [...expenses, early], netOf: { 1: 59_000, 2: 69_000, 3: -128_000 } })
    renderApp(`/households/7/report/${twoBack}`)
    await screen.findByText('Tháng này không có khoản chi hay khoản trả nào.')
    expect(screen.queryByRole('heading', { name: 'Chi theo danh mục' })).not.toBeInTheDocument()
  })
})
