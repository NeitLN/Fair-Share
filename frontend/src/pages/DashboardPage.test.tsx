import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { keys } from '../api/households'
import type { Notice, Settlement, SettlementInput } from '../api/types'
import { today } from '../lib/date'
import { mockApi, renderApp } from '../test/renderApp'
import { onAComputer } from '../test/screen'

beforeEach(() => {
  // The user answers "OK" to "Xoá khoản …?"
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  me = 1
})

const household = { id: 7, name: 'Nhà 7', created_at: '' }
const members = [
  { id: 1, household_id: 7, name: 'Tiến', created_at: '' },
  { id: 2, household_id: 7, name: 'Minh', created_at: '' },
  { id: 3, household_id: 7, name: 'An', created_at: '' },
]
// Tiến paid 300 000 for the three of them this month: Minh and An each owe him 100 000
const startNets: Record<number, number> = { 1: 200_000, 2: -100_000, 3: -100_000 }
const expense = {
  id: 50,
  household_id: 7,
  description: 'Lẩu',
  amount: 300_000,
  payer_id: 1,
  spent_at: today(),
  source: 'manual',
  created_at: '',
  split_type: 'equal',
  shares: [],
}

/** A fake API whose balances follow the settlements, like the real one. */
// Notices change version with every change, from one counter, like the server's sequence (specs/014)
let versions = 100
const nextVersion = () => ++versions
/** `amount` of `told` was recorded: what is left keeps waiting, with a new version. */
function takeFrom(list: Notice[], told: Notice, amount: number): Notice[] {
  return amount >= told.amount
    ? list.filter((n) => n !== told)
    : list.map((n) => (n === told ? { ...n, amount: n.amount - amount, version: nextVersion() } : n))
}

function api(extra: Parameters<typeof mockApi>[0] = {}, memberList = members, startNotices: Notice[] = []) {
  let settlements: Settlement[] = []
  // "Tôi đã chuyển" (docs/ACCOUNTS.md, S3): sent by `me`, answered by the receiver, like the real API
  let notices = [...startNotices]
  const pair = (n: Notice, from: number, to: number) => n.from_member_id === from && n.to_member_id === to
  const nets = () => {
    const net = { ...startNets }
    for (const s of settlements) {
      net[s.from_member_id] += s.amount
      net[s.to_member_id] -= s.amount
    }
    return net
  }
  return mockApi({
    // The account's own name in the household: "bạn" (docs/ACCOUNTS.md)
    'GET /api/households/7': () => [200, { ...household, role: 'member', member_id: me }],
    'GET /api/households/7/members': [200, memberList],
    'GET /api/households/7/expenses': [200, [expense]],
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
            sent: settlements.filter((s) => s.from_member_id === m.id).reduce((t, s) => t + s.amount, 0),
            received: settlements.filter((s) => s.to_member_id === m.id).reduce((t, s) => t + s.amount, 0),
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
      const { notice: paysNotice, ...input } = body as SettlementInput
      // As told money it is taken out of that notice (specs/014); another payment leaves notices alone
      const told = paysNotice && notices.find((n) => n.version === paysNotice.version)
      if (paysNotice && !told) return [409, { error: { code: 'notice_changed', message: 'changed' } }]
      const taken = told ? Math.min(input.amount, told.amount) : null
      const settlement: Settlement = {
        id: 30 + settlements.length,
        household_id: 7,
        note: input.note ?? null,
        created_at: '',
        // Recorded by the signed-in account (testUser), so it may delete it
        created_by: 9,
        notice_amount: taken,
        ...input,
      }
      settlements = [settlement, ...settlements]
      if (told && taken !== null) notices = takeFrom(notices, told, taken)
      return [201, settlement]
    },
    'GET /api/households/7/notices': () => [200, notices],
    // Every action names the version of the notice its screen showed (specs/014)
    'PUT /api/households/7/notices': (body) => {
      const { to_member_id, amount, version, note } = body as {
        to_member_id: number
        amount: number
        version: number | null
        note?: string
      }
      const current = notices.find((n) => pair(n, me as number, to_member_id))
      if ((current?.version ?? null) !== version) return [409, { error: { code: 'notice_changed', message: 'changed' } }]
      const notice: Notice = {
        from_member_id: me as number, to_member_id, amount, status: 'sent', created_at: '', version: nextVersion(),
        note: note?.trim() || null,
      }
      notices = [...notices.filter((n) => !pair(n, me as number, to_member_id)), notice]
      return [200, notice]
    },
    'POST /api/households/7/notices/1/add': (body) => {
      const { amount, version, note } = body as { amount: number; version: number; note?: string }
      const told = notices.find((n) => pair(n, me as number, 1) && n.status === 'sent' && n.version === version)
      if (!told) return [409, { error: { code: 'notice_changed', message: 'changed' } }]
      const added: Notice = {
        ...told,
        amount: told.amount + amount,
        version: nextVersion(),
        ...(note !== undefined && { note: note.trim() || null }),
      }
      notices = notices.map((n) => (n === told ? added : n))
      return [200, added]
    },
    'DELETE /api/households/7/notices/1': () => {
      notices = notices.filter((n) => !pair(n, me as number, 1))
      return [204]
    },
    'POST /api/households/7/notices/2/accept': (body) => {
      const { version, received, settled_at } = body as { version: number; received: number; settled_at: string }
      const told = notices.find((n) => pair(n, 2, me as number) && n.status === 'sent' && n.version === version)
      if (!told) return [409, { error: { code: 'notice_changed', message: 'changed' } }]
      const amount = received ?? told.amount
      const settlement: Settlement = {
        id: 30 + settlements.length,
        household_id: 7,
        from_member_id: 2,
        to_member_id: me as number,
        amount,
        settled_at,
        note: null,
        created_at: '',
        created_by: 9,
        notice_amount: amount,
      }
      settlements = [settlement, ...settlements]
      notices = takeFrom(notices, told, amount)
      return [201, settlement]
    },
    'POST /api/households/7/notices/2/decline': (body) => {
      const { version } = body as { version: number }
      const told = notices.find((n) => pair(n, 2, me as number) && n.status === 'sent' && n.version === version)
      if (!told) return [409, { error: { code: 'notice_changed', message: 'changed' } }]
      notices = notices.map((n) => (n === told ? { ...n, status: 'declined' as const, version: nextVersion() } : n))
      return [200, notices[0]]
    },
    'DELETE /api/settlements/30': () => {
      settlements = settlements.filter((s) => s.id !== 30)
      return [204]
    },
    ...extra,
  })
}

let me: number | null = 1
const iAm = (memberId: number) => {
  me = memberId
}
const transfers = () => screen.findByRole('list', { name: 'Các lần trả gợi ý' })
const region = (name: string) => within(screen.getByRole('region', { name }))
const month = Number(today().slice(5, 7))

test("this month's spending has its own block, apart from the balances that add up everything", async () => {
  api()
  renderApp('/households/7')

  // Design review 05/11: "Tháng 11 · cả nhà đã chi 790.000đ" sat right above "Minh đã chi 4.740.000đ"
  const label = `Tháng ${month}/${today().slice(0, 4)}`
  const thisMonth = await screen.findByRole('heading', { level: 2, name: `${label}: cả nhà chi 300.000đ` })
  const monthRows = within(screen.getByRole('list', { name: `Từng người trong ${label.toLowerCase()}` }))
  expect(monthRows.getAllByRole('listitem')).toHaveLength(3)

  const balances = region('Số dư từng người')
  expect(balances.getByText('tính từ tất cả khoản đã ghi')).toBeInTheDocument()
  expect(balances.queryByText(/cả nhà/)).not.toBeInTheDocument()
  expect(balances.getByText(/tổng đã chi/)).toHaveTextContent('tổng đã chi 300.000đ')
  expect(thisMonth.closest('section')).not.toBe(screen.getByRole('region', { name: 'Số dư từng người' }))
})

test("the month block opens this month's report (specs/004-monthly-report)", async () => {
  api()
  renderApp('/households/7')
  const link = await screen.findByRole('link', { name: 'Báo cáo tháng' })
  expect(link).toHaveAttribute('href', `/households/7/report/${today().slice(0, 7)}`)
})

// Verdict B (specs/003-desktop-redesign): the taro block answers, the transfers sit in a panel under it
describe('verdict B', () => {
  test('the taro block holds the sentence, the amount and "Vì sao ra số này?"; the transfers are in a panel under it', async () => {
    api()
    renderApp('/households/7')

    const sentence = await screen.findByRole('heading', { name: /^Bạn được nhận/ })
    const verdict = sentence.closest('section') as HTMLElement
    expect(within(verdict).getByText('Vì sao ra số này?')).toBeInTheDocument()
    expect(within(verdict).queryByRole('list', { name: 'Các lần trả gợi ý' })).not.toBeInTheDocument()
    expect(within(verdict).queryByRole('button', { name: 'Sao chép tin nhắn nhắc nợ' })).not.toBeInTheDocument()

    // Right under it, the cards and the reminder, with the same controls as before
    const panel = verdict.nextElementSibling as HTMLElement
    expect(panel).toHaveClass('transfers-panel')
    const cards = within(within(panel).getByRole('list', { name: 'Các lần trả gợi ý' })).getAllByRole('listitem')
    expect(cards).toHaveLength(2)
    expect(within(panel).getByRole('button', { name: 'Sao chép tin nhắn nhắc nợ' })).toBeInTheDocument()
  })

  test('a house with nothing to transfer shows no empty panel', async () => {
    api({
      'GET /api/households/7/balances': [
        200,
        {
          balances: members.map((m) => ({ member_id: m.id, name: m.name, paid: 0, owed: 0, sent: 0, received: 0, net: 0 })),
          suggested: [],
        },
      ],
    })
    renderApp('/households/7')

    await region('Số dư từng người').findAllByRole('listitem')
    expect(document.querySelector('.transfers-panel')).toBeNull()
  })
})

// "Vì sao ra số này?" (specs/002-balance-explanation)
describe('why this number', () => {
  test('under the verdict, your own balance opens as four lines whose total is your balance (US1)', async () => {
    api()
    const user = userEvent.setup()
    renderApp('/households/7')

    const why = await screen.findByText('Vì sao ra số này?')
    await user.click(why)
    const mine = screen.getByRole('group', { name: 'Số dư của bạn' })
    expect(within(mine).getAllByRole('listitem').map((l) => l.textContent?.replace(/\s+/g, ' '))).toEqual([
      'Bạn đã chi cho cả nhà+300.000đ',
      'Phần của bạn trong các khoản chi−100.000đ',
      'Bạn đã trả lạiKhông có khoản nào0đ',
      'Bạn đã nhận lạiKhông có khoản nào0đ',
    ])
    // The same number as your row in Số dư từng người
    expect(within(mine).getByText('Số dư').closest('p')).toHaveTextContent('Số dư+200.000đđược nhận')
    const rows = await region('Số dư từng người').findAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('+200.000đ')

    // Escape folds it and gives the focus back to what opened it
    await user.keyboard('{Escape}')
    expect(why.closest('details')).not.toHaveAttribute('open')
    expect(why).toHaveFocus()
  })

  test('with a balance of 0 there is nothing to explain under the verdict', async () => {
    api({
      'GET /api/households/7/balances': [
        200,
        {
          balances: members.map((m) => ({ member_id: m.id, name: m.name, paid: 0, owed: 0, sent: 0, received: 0, net: 0 })),
          suggested: [],
        },
      ],
    })
    renderApp('/households/7')

    await region('Số dư từng người').findAllByRole('listitem')
    expect(screen.queryByText('Vì sao ra số này?')).not.toBeInTheDocument()
  })

  test('an expense in the explanation opens Chi tiêu with that expense revealed (US2, FR-010)', async () => {
    api({ 'GET /api/households/7': [200, { ...household, role: 'member', member_id: 1 }] })
    const user = userEvent.setup()
    renderApp('/households/7')

    await user.click(await screen.findByText('Vì sao ra số này?'))
    await user.click(screen.getByText('Bạn đã chi cho cả nhà'))
    await user.click(within(screen.getByRole('list', { name: 'Bạn đã chi cho cả nhà' })).getByRole('link', { name: 'Lẩu' }))

    expect(await screen.findByRole('heading', { name: /Các khoản chi/ })).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('[data-expense="50"]')).toHaveClass('just-saved'))
  })

  test("each row of Số dư từng người opens that person's explanation, worded with their name (US3)", async () => {
    api()
    const user = userEvent.setup()
    renderApp('/households/7')

    const rows = await region('Số dư từng người').findAllByRole('listitem')
    expect(rows).toHaveLength(3)
    await user.click(within(rows[1]).getByText('Minh'))
    const minh = within(rows[1]).getByRole('group', { name: 'Số dư của Minh' })
    expect(within(minh).getAllByRole('listitem')[1]).toHaveTextContent('Phần của Minh trong các khoản chi−100.000đ')
    // The same number as the row it opens from (FR-002)
    expect(within(minh).getByText('Số dư').closest('p')).toHaveTextContent('Số dư−100.000đcần trả')
    expect(rows[1]).toHaveTextContent('−100.000đ')

    // Two at once: your own row says "bạn"
    await user.click(within(rows[0]).getByText('Tiến'))
    expect(within(rows[0]).getByRole('group', { name: 'Số dư của bạn' })).toBeInTheDocument()
    expect(within(rows[1]).getByRole('group', { name: 'Số dư của Minh' })).toBeInTheDocument()
  })

  test('a "Tôi đã chuyển" waiting for you is said apart and changes no number', async () => {
    const startNotices: Notice[] = [{ from_member_id: 2, to_member_id: 1, amount: 100_000, status: 'sent', created_at: '', version: 1 }]
    api({}, members, startNotices)
    const user = userEvent.setup()
    renderApp('/households/7')

    await user.click(await screen.findByText('Vì sao ra số này?'))
    const mine = screen.getByRole('group', { name: 'Số dư của bạn' })
    expect(await within(mine).findByText(/Minh đã báo chuyển/)).toHaveTextContent(
      'Minh đã báo chuyển 100.000đ cho bạn, chờ xác nhận: chưa tính vào số dư.',
    )
    expect(within(mine).getByText('Số dư').closest('p')).toHaveTextContent('+200.000đ')
  })
})

test("while the expenses load, a placeholder holds this month's place so the column does not jump", async () => {
  // Review of #172: nothing showed there until the expenses arrived
  api({ 'GET /api/households/7/expenses': () => new Promise(() => {}) })
  renderApp('/households/7')

  expect(await screen.findByText('Đang tải chi tiêu tháng này')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Số dư từng người' })).toBeInTheDocument()
})

test('before the household says who you are, the block counts the transfers left and lists them all', async () => {
  me = null
  api()
  renderApp('/households/7')

  expect(await screen.findByRole('heading', { name: 'Còn 2 lần trả nữa là cả nhà sạch nợ.' })).toBeInTheDocument()
  const rows = within(await transfers()).getAllByRole('listitem')
  expect(rows.map((row) => row.querySelector('.transfer-text')?.textContent)).toEqual([
    'Minh cần trả Tiến 100.000đ',
    'An cần trả Tiến 100.000đ',
  ])
  // Only the person who received it records a repayment (docs/ACCOUNTS.md, S2)
  expect(within(rows[0]).getByText('Chưa ghi khoản trả.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Đã (nhận|trả)$/ })).not.toBeInTheDocument()
})

test('someone who owes cannot mark their own debt as paid; they tell the receiver instead', async () => {
  iAm(2)
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7')

  const card = within(await transfers()).getAllByRole('listitem')[0]
  expect(card).toHaveTextContent('Bạn cần trả Tiến 100.000đ')
  // The list keeps the row as a status; the action is the one under the block (spec 012, US2)
  expect(within(card).queryByRole('button')).not.toBeInTheDocument()
  expect(card).toHaveTextContent('Chuyển xong thì báo để Tiến xác nhận.')
  await user.click(await screen.findByRole('button', { name: 'Tôi đã chuyển 100.000đ cho Tiến' }))

  expect(await screen.findByText('Đã báo Tiến.')).toBeInTheDocument()
  expect(await within(card).findByText('Đã báo, chờ Tiến xác nhận.')).toBeInTheDocument()
  // The amount told sits under the verdict's own amount, which does not change until Tiến confirms
  expect(await screen.findByText(/^Đã báo chuyển/)).toHaveTextContent('Đã báo chuyển 100.000đ, chờ Tiến xác nhận.')
  const told = fetchFn.mock.calls.find(([url, init]) => url === '/api/households/7/notices' && init?.method === 'PUT')
  expect(JSON.parse(told?.[1]?.body as string)).toEqual({ to_member_id: 1, amount: 100_000, version: null })
  // Telling changes no balance: the debt is still there until Tiến confirms
  expect(screen.getByRole('heading', { name: 'Bạn cần trả Tiến' })).toBeInTheDocument()

  // The pressed button is gone: the keyboard is on the next step, not lost at the top of the page
  await waitFor(() => expect(screen.getByRole('button', { name: 'Huỷ thông báo' })).toHaveFocus())

  // Pressed by mistake: taken back
  await user.click(screen.getByRole('button', { name: 'Huỷ thông báo' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Tôi đã chuyển 100.000đ cho Tiến' })).toHaveFocus(),
  )
})

test(`the receiver's button says what it does and how much: "Xác nhận đã nhận 100.000đ"`, async () => {
  // Design review 05/11: "Đã nhận" read like a status, not something to press
  api()
  renderApp('/households/7')

  const card = within(await transfers()).getAllByRole('listitem')[0]
  expect(within(card).getByRole('button', { name: 'Xác nhận đã nhận 100.000đ' })).toBeEnabled()
  expect(within(card).queryByRole('button', { name: 'Đã nhận' })).not.toBeInTheDocument()
})

test('the receiver sees who said they sent it; the button names and records the amount they told', async () => {
  const fetchFn = api({}, members, [
    { from_member_id: 2, to_member_id: 1, amount: 90_000, status: 'sent', created_at: '', version: 1 },
  ])
  const user = userEvent.setup()
  renderApp('/households/7')

  const card = within(await transfers()).getAllByRole('listitem')[0]
  const status = await within(card).findByText(/Minh báo đã chuyển/)
  // Not today's 100.000đ: the card says which amount is recorded, and so does the button
  expect(status).toHaveTextContent('Minh báo đã chuyển 90.000đ · lúc này Minh cần trả bạn 100.000đ')
  const received = within(card).getByRole('button', { name: 'Xác nhận đã nhận 90.000đ' })
  expect(received).toHaveAccessibleDescription(/Minh cần trả bạn 100\.000đ Minh báo đã chuyển 90\.000đ/)
  await user.click(received)

  await screen.findByText(/^Đã ghi:/)
  // Answered as that notice, once: not as a repayment typed in
  const accepted = fetchFn.mock.calls.find(([url]) => url === '/api/households/7/notices/2/accept')
  expect(JSON.parse(accepted?.[1]?.body as string)).toEqual({ version: 1, received: 90_000, settled_at: today() })
  expect(fetchFn.mock.calls.some(([url, init]) => url === '/api/households/7/settlements' && init?.method === 'POST')).toBe(false)
})

// specs/014-partial-transfer-notices, PR-1
describe('the receiver got only part of it', () => {
  test('"Nhận số khác" records exactly that amount, with the notice version; the rest keeps waiting', async () => {
    const fetchFn = api({}, members, [
      { from_member_id: 2, to_member_id: 1, amount: 100_000, status: 'sent', created_at: '', version: 7 },
    ])
    const user = userEvent.setup()
    renderApp('/households/7')

    const card = within(await transfers()).getAllByRole('listitem')[0]
    await within(card).findByText(/Minh báo đã chuyển/)
    const other = within(card).getByRole('button', { name: 'Nhận số khác' })
    await user.click(other)
    const field = within(card).getByLabelText('Số tiền đã nhận')
    expect(field).toHaveFocus()
    expect(field).toHaveValue('100000')
    // More than told is refused under the field, nothing is sent
    await user.clear(field)
    await user.type(field, '120k{Enter}')
    expect(within(card).getByText('Không ghi được quá số đã báo (100.000đ).')).toBeInTheDocument()
    await user.clear(field)
    await user.type(field, '60k')
    expect(within(card).getByText('= 60.000đ')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Ghi số này' }))

    await screen.findByText(/^Đã ghi:/)
    const accepted = fetchFn.mock.calls.find(([url]) => url === '/api/households/7/notices/2/accept')
    expect(JSON.parse(accepted?.[1]?.body as string)).toEqual({ version: 7, received: 60_000, settled_at: today() })
    // Minh still owes 40.000đ: the verdict never said the house was settled
    expect(screen.queryByText(/sạch nợ/)).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getAllByText(/Minh báo đã chuyển/).some((e) => /40\.000đ/.test(e.textContent ?? ''))).toBe(true),
    )
  })

  test('Escape closes "Nhận số khác" and gives the focus back to its button', async () => {
    api({}, members, [{ from_member_id: 2, to_member_id: 1, amount: 100_000, status: 'sent', created_at: '', version: 7 }])
    const user = userEvent.setup()
    renderApp('/households/7')
    const card = within(await transfers()).getAllByRole('listitem')[0]
    const other = await within(card).findByRole('button', { name: 'Nhận số khác' })
    await user.click(other)
    await user.keyboard('{Escape}')
    expect(within(card).queryByLabelText('Số tiền đã nhận')).not.toBeInTheDocument()
    expect(other).toHaveFocus()
  })

  test('a repayment typed in while Minh\'s notice waits asks whether it is that money', async () => {
    const fetchFn = api({}, members, [
      { from_member_id: 2, to_member_id: 1, amount: 100_000, status: 'sent', created_at: '', version: 7 },
    ])
    const user = userEvent.setup()
    renderApp('/households/7')
    const history = screen.getByRole('region', { name: 'Lịch sử trả tiền' })
    await user.click(await within(history).findByText('Ghi khoản trả khác'))
    await user.selectOptions(within(history).getByLabelText('Người trả'), 'Minh')
    const told = await screen.findByRole('radio', { name: 'Tiền Minh đã báo (100.000đ)' })
    expect(told).toBeChecked()
    await user.type(within(history).getByLabelText('Số tiền (đồng)'), '30000')
    await user.click(within(history).getByRole('button', { name: 'Lưu khoản trả' }))
    await waitFor(() =>
      expect(fetchFn.mock.calls.some(([url, init]) => url === '/api/households/7/settlements' && init?.method === 'POST')).toBe(true),
    )
    const sent = fetchFn.mock.calls.find(([url, init]) => url === '/api/households/7/settlements' && init?.method === 'POST')
    expect(JSON.parse(sent?.[1]?.body as string)).toMatchObject({ amount: 30_000, notice: { version: 7 } })
  })
})

test('"Chưa nhận được" goes back to the payer, who can tell again', async () => {
  const startNotices: Notice[] = [{ from_member_id: 2, to_member_id: 1, amount: 100_000, status: 'sent', created_at: '', version: 1 }]
  api({}, members, startNotices)
  const user = userEvent.setup()
  renderApp('/households/7')

  const card = within(await transfers()).getAllByRole('listitem')[0]
  await user.click(within(card).getByRole('button', { name: 'Chưa nhận được' }))
  expect(await screen.findByText('Đã báo Minh là chưa nhận được.')).toBeInTheDocument()
  await waitFor(() => expect(within(card).queryByText(/Minh báo đã chuyển/)).not.toBeInTheDocument())
})

test('the payer sees "chưa nhận được" on their card', async () => {
  iAm(2)
  api({}, members, [{ from_member_id: 2, to_member_id: 1, amount: 100_000, status: 'declined', created_at: '', version: 1 }])
  renderApp('/households/7')

  const card = within(await transfers()).getAllByRole('listitem')[0]
  expect(await within(card).findByText(/Tiến báo chưa nhận được tiền/)).toBeInTheDocument()
  // The row is the state only; the way to try again is the one under the block (spec 012, US2)
  expect(within(card).queryByRole('button')).not.toBeInTheDocument()
  await waitFor(() =>
    expect(document.querySelector('.debtor-action p')).toHaveTextContent('Tiến báo chưa nhận được 100.000đ.'),
  )
  expect(screen.getByRole('button', { name: 'Tôi đã chuyển 100.000đ cho Tiến' })).toBeInTheDocument()
})

test('a notice whose transfer is not suggested any more keeps its own card, for both of them', async () => {
  // An told Minh, then the balances changed: An → Minh is not a suggestion, but money may have moved
  const leftOver: Notice[] = [{ from_member_id: 3, to_member_id: 2, amount: 50_000, status: 'sent', created_at: '', version: 1 }]
  iAm(2)
  api({}, members, leftOver)
  const { unmount } = renderApp('/households/7')

  const card = (await within(await transfers()).findByText(/^An cần trả bạn/)).closest('li') as HTMLElement
  expect(card).toHaveTextContent('An báo đã chuyển 50.000đ · hiện không còn gợi ý')
  expect(within(card).getByRole('button', { name: /^Xác nhận đã nhận/ })).toBeEnabled()
  expect(within(card).getByRole('button', { name: 'Chưa nhận được' })).toBeEnabled()
  unmount()

  iAm(3)
  api({}, members, leftOver)
  renderApp('/households/7')
  const mine = (await within(await transfers()).findByText(/^Bạn cần trả Minh/)).closest('li') as HTMLElement
  expect(mine).toHaveTextContent('Đã báo 50.000đ · Hiện không còn gợi ý chuyển cho Minh.')
  expect(within(mine).getByRole('button', { name: 'Huỷ thông báo' })).toBeEnabled()
})

test('until the notices are known, nothing that depends on them can be pressed', async () => {
  // Đã nhận could record the suggestion instead of a told amount; the payer could tell twice
  api({ 'GET /api/households/7/notices': [500, { error: { code: 'internal_error', message: 'down' } }] })
  renderApp('/households/7')

  expect(await screen.findByText(/Chưa tải được các lần báo/)).toBeInTheDocument()
  for (const button of within(await transfers()).getAllByRole('button', { name: /^Xác nhận đã nhận/ })) {
    expect(button).toBeDisabled()
  }
  expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
})

test('someone who owes sees who to pay and how much, as "Bạn"', async () => {
  iAm(2)
  api()
  renderApp('/households/7')

  const sentence = await screen.findByRole('heading', { name: 'Bạn cần trả Tiến' })
  expect(sentence.nextElementSibling).toHaveTextContent('100.000đ')
  expect(within(await transfers()).getByText(/^Bạn cần trả Tiến/)).toBeInTheDocument()
})

test('someone who is owed sees who pays them, and the total', async () => {
  iAm(1)
  api()
  renderApp('/households/7')

  const sentence = await screen.findByRole('heading', { name: 'Bạn được nhận từ Minh và An' })
  expect(sentence.nextElementSibling).toHaveTextContent('200.000đ')
  expect(within(await transfers()).getByText(/^Minh cần trả bạn/)).toBeInTheDocument()
  // The two who send the money sit in the block's corner as stickers, decoration only (owner, 07/11)
  const stickers = sentence.closest('section')?.querySelector('.verdict-people')
  expect(stickers).toHaveAttribute('aria-hidden', 'true')
  expect([...(stickers?.querySelectorAll('.avatar') ?? [])].map((a) => a.textContent)).toEqual(['M', 'A'])
})

test('every member has a row with where they stand, in words and with a sign', async () => {
  iAm(1)
  api()
  renderApp('/households/7')

  const rows = await within(screen.getByRole('region', { name: 'Số dư từng người' })).findAllByRole('listitem')
  expect(rows[0]).toHaveTextContent(/Tiếnbạntổng đã chi 300\.000đ\+200\.000đđược nhận$/)
  expect(rows[1]).toHaveTextContent(/Minh−100\.000đcần trả$/)
  expect(rows[2]).toHaveTextContent(/An−100\.000đcần trả$/)
})

test('"Đã trả" records the suggested transfer, paid today', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: /^Xác nhận đã nhận/ })[0])

  await waitFor(() => expect(screen.getAllByRole('button', { name: /^Xác nhận đã nhận/ })).toHaveLength(1))
  expect(
    await region('Lịch sử trả tiền').findByRole('button', { name: /^Xoá khoản Minh trả Tiến/ }),
  ).toBeInTheDocument()
  const post = fetchFn.mock.calls.find(([, init]) => init?.method === 'POST')
  expect(JSON.parse(post?.[1]?.body as string)).toEqual({
    from_member_id: 2,
    to_member_id: 1,
    amount: 100_000,
    settled_at: today(),
  })
})

test('after the last suggested payment the household is settled, and everyone gets the stamp', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: /^Xác nhận đã nhận/ })[0])
  await waitFor(() => expect(screen.getAllByRole('button', { name: /^Xác nhận đã nhận/ })).toHaveLength(1))
  await user.click(screen.getByRole('button', { name: /^Xác nhận đã nhận/ }))

  expect(await screen.findByRole('heading', { name: 'Cả nhà sạch nợ. Nhà trọ bình yên.' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Sao chép tin nhắn nhắc nợ' })).not.toBeInTheDocument()
  expect(region('Số dư từng người').getAllByText('SẠCH NỢ')).toHaveLength(3)
})

test('a payment that is not a suggestion is recorded with the folded form', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  const history = region('Lịch sử trả tiền')
  await user.click(await history.findByText('Ghi khoản trả khác'))
  await user.selectOptions(history.getByLabelText('Người trả'), 'An')
  // The receiver is you, and cannot be changed: only the receiver records a repayment
  expect(history.getByLabelText('Người nhận')).toHaveValue('1')
  expect(history.getByLabelText('Người nhận')).toBeDisabled()
  await user.type(history.getByLabelText('Số tiền (đồng)'), '40k')
  await user.click(history.getByRole('button', { name: 'Lưu khoản trả' }))

  expect(await history.findByText(/40\.000/)).toBeInTheDocument()
  // An still owes 60 000
  await waitFor(() =>
    expect(within(screen.getByRole('list', { name: 'Các lần trả gợi ý' })).getByText(/^An cần trả bạn/)).toHaveTextContent(
      'An cần trả bạn 60.000đ',
    ),
  )
})

test('a mistaken payment can be deleted, and the debt comes back', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: /^Xác nhận đã nhận/ })[0])
  const history = region('Lịch sử trả tiền')
  await user.click(await history.findByRole('button', { name: /^Xoá khoản Minh trả Tiến/ }))

  expect(await history.findByText(/^Chưa ghi khoản trả nào/)).toBeInTheDocument()
  await waitFor(() => expect(screen.getAllByRole('button', { name: /^Xác nhận đã nhận/ })).toHaveLength(2))
})

test('the reminder goes to the clipboard, ready for the group chat', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(await screen.findByRole('button', { name: 'Sao chép tin nhắn nhắc nợ' }))

  expect(await navigator.clipboard.readText()).toBe(
    [
      `Nhà 7 ơi, còn mấy khoản cần trả nè:`,
      '• Minh trả Tiến 100.000đ',
      '• An trả Tiến 100.000đ',
      // The invite link, so everyone in the group chat can open the household (#132)
      `Xem chi tiết: ${window.location.origin}/households/7`,
    ].join('\n'),
  )
  expect(await screen.findByRole('status')).toHaveTextContent('Đã sao chép. Dán vào nhóm chat của nhà nhé.')
})

test('when copying is not possible the reminder is shown, selected, to copy by hand', async () => {
  api()
  const user = userEvent.setup()
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('NotAllowedError'))
  renderApp('/households/7')

  await user.click(await screen.findByRole('button', { name: 'Sao chép tin nhắn nhắc nợ' }))

  const text = (await screen.findByLabelText(/^Không sao chép được/)) as HTMLTextAreaElement
  expect(text.value).toMatch(/^Nhà 7 ơi, còn mấy khoản cần trả nè:\n• Minh trả Tiến 100\.000đ/)
  const selectedAll = () =>
    expect([text.selectionStart, text.selectionEnd]).toEqual([0, text.value.length])
  expect(text).toHaveFocus()
  selectedAll()
  expect(screen.getByRole('status')).toBeEmptyDOMElement()

  // Trying again and failing again goes back to the text, selected again
  text.setSelectionRange(0, 0)
  await user.click(screen.getByRole('button', { name: 'Sao chép tin nhắn nhắc nợ' }))
  await waitFor(() => expect(text).toHaveFocus())
  selectedAll()
})

test('a failed balances load says so in the block, and Thử lại tries again', async () => {
  let fail = true
  api({
    'GET /api/households/7/balances': () =>
      fail
        ? [503, { error: { code: 'database_unavailable', message: 'The database is not reachable right now' } }]
        : [200, { balances: [], suggested: [] }],
  })
  const user = userEvent.setup()
  renderApp('/households/7')

  expect(await screen.findByRole('heading', { name: 'Chưa tính được ai trả ai' })).toBeInTheDocument()
  // One message, where the retry is: the balance rows only say they are not loaded
  expect(screen.getByRole('alert')).toHaveTextContent('Máy chủ tạm thời không kết nối được dữ liệu.')
  expect(region('Số dư từng người').getByText('Chưa tải được số dư.')).toBeInTheDocument()
  expect(screen.queryByText(/sạch nợ/i)).not.toBeInTheDocument()

  fail = false
  await user.click(screen.getByRole('button', { name: 'Thử lại' }))
  expect(await screen.findByRole('heading', { name: /^Chưa có khoản chi nào/ })).toBeInTheDocument()
})

test('balances left over from before an expense was saved are not shown as the answer', async () => {
  // Found in the 02/11 walkthrough: Overview said "Chưa có khoản chi nào" and 0đ for everyone while the
  // month line already counted the new expense, until the slower balances request came back
  me = null // the household's own verdict, not one person's
  let saved = false
  let answerBalances: () => void = () => {}
  const balancesWith = (paidByTien: number) => ({
    balances: members.map((m) => ({
      member_id: m.id,
      name: m.name,
      paid: m.id === 1 ? paidByTien : 0,
      owed: paidByTien / 3,
      sent: 0,
      received: 0,
      net: paidByTien ? startNets[m.id] : 0,
    })),
    suggested: paidByTien ? [2, 3].map((id) => ({ from_member_id: id, to_member_id: 1, amount: 100_000 })) : [],
  })
  api({
    'GET /api/households/7/expenses': () => [200, saved ? [expense] : []],
    'GET /api/households/7/balances': () =>
      saved
        ? new Promise((resolve) => {
            answerBalances = () => resolve([200, balancesWith(300_000)])
          })
        : [200, balancesWith(0)],
  })
  const user = userEvent.setup()
  const { client } = renderApp('/households/7')
  expect(await screen.findByRole('heading', { name: /^Chưa có khoản chi nào/ })).toBeInTheDocument()

  // On the expenses tab an expense is saved: the page refreshes everything cached for the household
  await user.click(screen.getByRole('link', { name: 'Chi tiêu' }))
  saved = true
  await client.invalidateQueries({ queryKey: keys.household(7) })
  await user.click(screen.getByRole('link', { name: 'Tổng quan' }))

  expect(await screen.findByRole('heading', { name: 'Đang tính ai trả ai…' })).toBeInTheDocument()
  expect(screen.queryByText(/^Chưa có khoản chi nào/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Đã trả' })).not.toBeInTheDocument()

  answerBalances()
  expect(await screen.findByRole('heading', { name: 'Còn 2 lần trả nữa là cả nhà sạch nợ.' })).toBeInTheDocument()
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

test('"+ Ghi khoản chi" leads to the expenses tab', async () => {
  api()
  renderApp('/households/7')

  expect(await screen.findByRole('link', { name: '+ Ghi khoản chi' })).toHaveAttribute(
    'href',
    '/households/7/expenses',
  )
})

test('names come from the balances while the members are still loading or failed', async () => {
  api({
    'GET /api/households/7/members': [
      503,
      { error: { code: 'database_unavailable', message: 'The database is not reachable right now' } },
    ],
  })
  const user = userEvent.setup()
  renderApp('/households/7')

  const rows = within(await transfers()).getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('Minh cần trả bạn 100.000đ')
  expect(screen.queryByText(/Thành viên cũ/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Sao chép tin nhắn nhắc nợ' }))
  expect(await navigator.clipboard.readText()).toContain('• Minh trả Tiến 100.000đ')
  expect(screen.getAllByRole('button', { name: 'Thử lại' }).length).toBeGreaterThan(0)
})

test('the month line says when this month\'s total could not be loaded', async () => {
  api({ 'GET /api/households/7/expenses': [503, { error: { code: 'database_unavailable', message: 'x' } }] })
  renderApp('/households/7')

  expect(await screen.findByText(/chưa tải được tổng chi/)).toHaveTextContent(
    `Tháng ${month} · chưa tải được tổng chi`,
  )
})

test('"Ghi khoản trả khác" opens and closes again from its own summary', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  const summary = await region('Lịch sử trả tiền').findByText('Ghi khoản trả khác')
  const fold = summary.closest('details') as HTMLDetailsElement
  await user.click(summary)
  expect(fold.open).toBe(true)
  await user.click(summary)
  expect(fold.open).toBe(false)
})

test('"Đã trả" stamps the card, keeps it in place and offers Hoàn tác, in the card and in a toast', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: /^Xác nhận đã nhận/ })[0])

  const status = screen.getByRole('status')
  expect(await within(status).findByText('Đã ghi: Minh đã trả bạn 100.000đ')).toBeInTheDocument()
  const rows = within(screen.getByRole('list', { name: 'Các lần trả gợi ý' })).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(rows[0]).toHaveTextContent('Minh đã trả bạn 100.000đ')
  expect(within(rows[0]).getByText('ĐÃ TRẢ')).toBeInTheDocument()
  // Keyboard focus moved from the pressed button to this card's Hoàn tác
  expect(within(rows[0]).getByRole('button', { name: 'Hoàn tác' })).toHaveFocus()
  expect(within(rows[1]).getByRole('button', { name: /^Xác nhận đã nhận/ })).toBeInTheDocument()
})

test('Hoàn tác in the toast deletes exactly the payment that was recorded', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: /^Xác nhận đã nhận/ })[0])
  const status = screen.getByRole('status')
  await user.click(await within(status).findByRole('button', { name: 'Hoàn tác' }))

  expect(await within(status).findByText('Đã hoàn tác: Minh đã trả bạn 100.000đ')).toBeInTheDocument()
  const deletes = fetchFn.mock.calls.filter(([, init]) => init?.method === 'DELETE')
  expect(deletes.map(([url]) => url)).toEqual(['/api/settlements/30'])
  await waitFor(() => expect(screen.getAllByRole('button', { name: /^Xác nhận đã nhận/ })).toHaveLength(2))
  expect(screen.queryByText('ĐÃ TRẢ')).not.toBeInTheDocument()
})

test('a double click records the transfer once', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7')

  const button = within(await transfers()).getAllByRole('button', { name: /^Xác nhận đã nhận/ })[0]
  await user.dblClick(button)

  expect(await screen.findByText('ĐÃ TRẢ')).toBeInTheDocument()
  expect(fetchFn.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

test('undoing twice, from the card and the toast, deletes once', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: /^Xác nhận đã nhận/ })[0])
  const toastUndo = await within(screen.getByRole('status')).findByRole('button', { name: 'Hoàn tác' })
  const cardUndo = within(screen.getByRole('list', { name: 'Các lần trả gợi ý' })).getByRole('button', {
    name: 'Hoàn tác',
  })
  await user.click(cardUndo)
  await user.click(toastUndo)

  await waitFor(() => expect(screen.getAllByRole('button', { name: /^Xác nhận đã nhận/ })).toHaveLength(2))
  expect(fetchFn.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1)
})

test('undoing a payment that was already deleted says so and drops the stamp', async () => {
  api({ 'DELETE /api/settlements/30': [404, { error: { code: 'settlement_not_found', message: 'gone' } }] })
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: /^Xác nhận đã nhận/ })[0])
  await user.click(await within(screen.getByRole('status')).findByRole('button', { name: 'Hoàn tác' }))

  expect(await screen.findByText('Khoản trả này đã được xoá trước đó.')).toBeInTheDocument()
  expect(screen.queryByText('ĐÃ TRẢ')).not.toBeInTheDocument()
})

test('a failed undo keeps the stamp and offers Thử lại', async () => {
  api({ 'DELETE /api/settlements/30': [503, { error: { code: 'database_unavailable', message: 'down' } }] })
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: /^Xác nhận đã nhận/ })[0])
  await user.click(await within(screen.getByRole('status')).findByRole('button', { name: 'Hoàn tác' }))

  const status = screen.getByRole('status')
  expect(await within(status).findByText(/^Chưa hoàn tác được\. Máy chủ tạm thời/)).toBeInTheDocument()
  expect(within(status).getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
  expect(screen.getByText('ĐÃ TRẢ')).toBeInTheDocument()
})

test('a failed "Đã trả" says why and leaves the card to try again', async () => {
  api({ 'POST /api/households/7/settlements': [503, { error: { code: 'database_unavailable', message: 'down' } }] })
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: /^Xác nhận đã nhận/ })[0])

  expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ tạm thời không kết nối được dữ liệu.')
  expect(screen.getAllByRole('button', { name: /^Xác nhận đã nhận/ })).toHaveLength(2)
  expect(screen.queryByText('ĐÃ TRẢ')).not.toBeInTheDocument()
})

test('deleting the recorded payment from the history removes its stamped card', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: /^Xác nhận đã nhận/ })[0])
  expect(await screen.findByText('ĐÃ TRẢ')).toBeInTheDocument()
  await user.click(await region('Lịch sử trả tiền').findByRole('button', { name: /^Xoá khoản Minh trả Tiến/ }))

  await waitFor(() => expect(screen.queryByText('ĐÃ TRẢ')).not.toBeInTheDocument())
  expect(screen.getAllByRole('button', { name: /^Xác nhận đã nhận/ })).toHaveLength(2)
})

test('Hoàn tác from the toast puts keyboard focus on the verdict once the card is gone', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: /^Xác nhận đã nhận/ })[0])
  await user.click(await within(screen.getByRole('status')).findByRole('button', { name: 'Hoàn tác' }))

  await waitFor(() => expect(screen.getAllByRole('button', { name: /^Xác nhận đã nhận/ })).toHaveLength(2))
  expect(screen.getByRole('heading', { name: 'Bạn được nhận từ Minh và An' })).toHaveFocus()
})

test('if the balances cannot be refreshed after "Đã trả", the paid transfer is not offered again', async () => {
  let posted = false
  api({
    'POST /api/households/7/settlements': (body) => {
      posted = true
      const input = body as SettlementInput
      return [201, { id: 30, household_id: 7, note: null, created_at: '', ...input }]
    },
  })
  const fetchFn = vi.mocked(fetch)
  const real = fetchFn.getMockImplementation()
  fetchFn.mockImplementation(async (url, init) =>
    posted && String(url).endsWith('/balances')
      ? new Response(JSON.stringify({ error: { code: 'database_unavailable', message: 'down' } }), { status: 503 })
      : real!(url as string, init),
  )
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: /^Xác nhận đã nhận/ })[0])

  expect(await screen.findByText('ĐÃ TRẢ')).toBeInTheDocument()
  await waitFor(() => expect(fetchFn.mock.calls.filter(([u]) => String(u).endsWith('/balances')).length).toBeGreaterThan(1))
  // The last verdict stays, says it is not up to date, and Minh's transfer is not payable twice
  expect(await screen.findByText(/^Chưa cập nhật được số dư mới nhất/)).toBeInTheDocument()
  const rows = within(screen.getByRole('list', { name: 'Các lần trả gợi ý' })).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(screen.getAllByRole('button', { name: /^Xác nhận đã nhận/ })).toHaveLength(1)
  expect(within(rows[1]).getByText(/^An cần trả bạn/)).toBeInTheDocument()
})

test('Escape closes "Ghi khoản trả khác" and focuses its summary', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')
  const summary = await region('Lịch sử trả tiền').findByText('Ghi khoản trả khác')
  const fold = summary.closest('details') as HTMLDetailsElement
  await user.click(summary)
  await user.click(region('Lịch sử trả tiền').getByLabelText('Số tiền (đồng)'))

  await user.keyboard('{Escape}')

  expect(fold.open).toBe(false)
  expect(summary).toHaveFocus()
})

test('on a computer the repayments sit under the verdict and the latest expenses under the balances', async () => {
  onAComputer()
  api()
  renderApp('/households/7')

  const recent = await screen.findByRole('region', { name: 'Khoản chi gần đây' })
  expect(await within(recent).findByText('Lẩu')).toBeInTheDocument()
  expect(within(recent).getByRole('link', { name: 'Xem tất cả' })).toHaveAttribute('href', '/households/7/expenses')
  // Two columns, in the keyboard's order too: the verdict and the history, then the balances and the list
  const history = screen.getByRole('region', { name: 'Lịch sử trả tiền' })
  expect(history.closest('.split-lead')).toContainElement(screen.getByRole('link', { name: '+ Ghi khoản chi' }))
  expect(recent.closest('.split-rest')).toContainElement(screen.getByRole('region', { name: 'Số dư từng người' }))
})

test('your own transfer comes first, the household\'s after', async () => {
  iAm(3)
  api()
  renderApp('/households/7')

  const rows = within(await transfers()).getAllByRole('listitem')
  expect(rows.map((row) => row.querySelector('.transfer-text')?.textContent)).toEqual([
    'Bạn cần trả Tiến 100.000đ',
    'Minh cần trả Tiến 100.000đ',
  ])
})

test('+ Ghi khoản chi comes before the verdict and opens Chi tiêu ready to type', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  const add = await screen.findByRole('link', { name: '+ Ghi khoản chi' })
  const verdict = await screen.findByRole('heading', { level: 2, name: /Bạn được nhận/ })
  expect(add.compareDocumentPosition(verdict) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

  await user.click(add)
  await waitFor(() => expect(screen.getByLabelText('Nội dung')).toHaveFocus())
})

// UI review 04/11: success is said once the server has it, and no dead Hoàn tác stays on screen
test('while Đã nhận is being recorded the sentence still counts that transfer', async () => {
  api({ 'POST /api/households/7/settlements': () => new Promise(() => {}) })
  const user = userEvent.setup()
  renderApp('/households/7')

  expect(await screen.findByRole('heading', { name: 'Bạn được nhận từ Minh và An' })).toBeInTheDocument()
  await user.click(within(await transfers()).getAllByRole('button', { name: /^Xác nhận đã nhận/ })[0])

  expect(await screen.findByText('Đang ghi…')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Bạn được nhận từ Minh và An' })).toBeInTheDocument()
})

test('undoing from the card takes its "Đã ghi … Hoàn tác" toast away', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: /^Xác nhận đã nhận/ })[0])
  expect(await screen.findByText(/^Đã ghi:/)).toBeInTheDocument()
  await user.click(await within(await transfers()).findByRole('button', { name: 'Hoàn tác' }))

  expect(await screen.findByText(/^Đã hoàn tác/)).toBeInTheDocument()
  expect(screen.queryByText(/^Đã ghi:/)).not.toBeInTheDocument()
})

test('a "Tôi đã chuyển" waiting for you shows as a count on Tổng quan', async () => {
  api({}, members, [{ from_member_id: 2, to_member_id: 1, amount: 100_000, status: 'sent', created_at: '', version: 1 }])
  renderApp('/households/7')

  expect(
    await screen.findByRole('link', { name: /^Tổng quan.*1 thông báo đã chuyển tiền đang chờ bạn xác nhận$/ }),
  ).toBeInTheDocument()
})

test('a history with nothing in it does not point at a button you may not have', async () => {
  iAm(2)
  api()
  renderApp('/households/7')

  expect(await screen.findByText('Chưa ghi khoản trả nào.')).toBeInTheDocument()
})

// "Mới ghi" (specs/006-recently-added). The signed-in account is 9 (testUser), the member Tiến (1)
describe('Mới ghi', () => {
  const accounts = [
    { ...members[0], user_id: 9 },
    { ...members[1], user_id: 10 },
    { ...members[2], user_id: 11 },
  ]
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
  const recorded = (id: number, description: string, created_by: number | null, minutes: number) => ({
    ...expense,
    id,
    description,
    created_by,
    created_at: ago(minutes),
  })
  const receivedFromMe = {
    id: 70,
    household_id: 7,
    from_member_id: 1,
    to_member_id: 2,
    amount: 100_000,
    settled_at: today(),
    note: null,
    created_at: ago(30),
    created_by: 10,
  }
  let expenseList: unknown[] = []
  let settlementList: unknown[] = []
  const withRecords = (extra: Parameters<typeof mockApi>[0] = {}) =>
    api(
      {
        'GET /api/households/7/expenses': () => [200, expenseList],
        'GET /api/households/7/settlements': () => [200, settlementList],
        ...extra,
      },
      accounts,
    )
  const strip = () => screen.findByRole('region', { name: 'Mới ghi' })
  const lineTexts = (region: HTMLElement) =>
    within(region)
      .getAllByRole('link')
      .map((l) => l.querySelector('.recent-text')?.textContent)

  beforeEach(() => {
    expenseList = [
      recorded(61, 'Lẩu tối', 10, 60), // Minh recorded it
      recorded(62, 'Tiền điện', 9, 10), // the signed-in account's own
      recorded(63, 'Từ trước khi có tài khoản', null, 5),
    ]
    settlementList = [receivedFromMe]
  })

  test("housemates' records only, newest first, first on the right on a computer", async () => {
    onAComputer()
    withRecords()
    renderApp('/households/7')
    const region = await strip()
    expect(lineTexts(region)).toEqual(['Minh xác nhận đã nhận 100.000đ từ bạn', 'Minh ghi Lẩu tối · 300.000đ'])
    const rest = region.parentElement as HTMLElement
    expect(rest).toHaveClass('split-rest')
    expect(rest.firstElementChild).toBe(region)
  })

  test('no strip while a list is still loading', async () => {
    withRecords({ 'GET /api/households/7/expenses': () => new Promise(() => {}) })
    renderApp('/households/7')
    await screen.findByRole('region', { name: 'Số dư từng người' })
    expect(screen.queryByRole('region', { name: 'Mới ghi' })).not.toBeInTheDocument()
  })

  test('Đánh dấu đã xem hết hides it, and after a reload only newer records come back', async () => {
    withRecords()
    const first = renderApp('/households/7')
    await userEvent.click(within(await strip()).getByRole('button', { name: 'Đánh dấu đã xem hết 2 mục mới' }))
    expect(screen.queryByRole('region', { name: 'Mới ghi' })).not.toBeInTheDocument()
    first.unmount()

    const second = renderApp('/households/7')
    await screen.findByRole('region', { name: 'Số dư từng người' })
    await screen.findByText(/cả nhà chi/)
    expect(screen.queryByRole('region', { name: 'Mới ghi' })).not.toBeInTheDocument()
    second.unmount()

    expenseList = [...expenseList, recorded(64, 'Trà sữa', 11, 1)]
    renderApp('/households/7')
    expect(lineTexts(await strip())).toEqual(['An ghi Trà sữa · 300.000đ'])
  })

  test('an expense saved before the newest repayment but loaded after Đánh dấu đã xem hết still shows (two marks)', async () => {
    // The repayment (30 min ago) is loaded; Minh's expense from 45 min ago is not yet
    expenseList = [recorded(62, 'Tiền điện', 9, 120)]
    withRecords()
    const first = renderApp('/households/7')
    await userEvent.click(within(await strip()).getByRole('button', { name: /^Đánh dấu đã xem hết/ }))
    first.unmount()

    expenseList = [...expenseList, recorded(65, 'Gạo', 10, 45)]
    renderApp('/households/7')
    expect(lineTexts(await strip())).toEqual(['Minh ghi Gạo · 300.000đ'])
  })

  test('a blocked storage keeps the page working, hidden for this visit only', async () => {
    const setItem = Storage.prototype.setItem
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.startsWith('fair-share:seen:')) throw new Error('blocked')
      setItem.call(this, key, value)
    })
    withRecords()
    const first = renderApp('/households/7')
    await userEvent.click(within(await strip()).getByRole('button', { name: /^Đánh dấu đã xem hết/ }))
    expect(screen.queryByRole('region', { name: 'Mới ghi' })).not.toBeInTheDocument()
    first.unmount()
    renderApp('/households/7')
    expect(await strip()).toBeInTheDocument()
    spy.mockRestore()
  })
})

// "Đến ngày ghi" (specs/007-recurring-expenses)
describe('Đến ngày ghi', () => {
  const dueToday = {
    id: 7, household_id: 7, description: 'Internet', category: 'utilities', payer_id: 2, member_ids: [1, 2, 3],
    amount: 300_000, day: Number(today().slice(8, 10)), created_by: 10, created_at: '',
  }

  test('under the transfers, in the left column; the right column starts as before', async () => {
    onAComputer()
    api({ 'GET /api/households/7/recurring': [200, [dueToday]] })
    renderApp('/households/7')
    const card = await screen.findByRole('region', { name: 'Đến ngày ghi' })
    expect(card).toHaveTextContent('Internet300.000đ · Minh trả')
    expect(card.closest('.split-lead')).not.toBeNull()
    const lead = card.closest('.split-lead') as HTMLElement
    const panel = lead.querySelector('.transfers-panel')
    if (panel) expect(panel.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(card).getByRole('link', { name: 'Ghi Internet tháng này' })).toBeInTheDocument()
  })

  test('nothing while the items are loading, and nothing once this month is recorded', async () => {
    api({ 'GET /api/households/7/recurring': () => new Promise(() => {}) })
    const first = renderApp('/households/7')
    await screen.findByRole('region', { name: 'Số dư từng người' })
    expect(screen.queryByRole('region', { name: 'Đến ngày ghi' })).not.toBeInTheDocument()
    first.unmount()

    api({
      'GET /api/households/7/recurring': [200, [dueToday]],
      'GET /api/households/7/expenses': [200, [{ ...expense, recurring_item_id: 7 }]],
    })
    renderApp('/households/7')
    await screen.findByText(/cả nhà chi/)
    expect(screen.queryByRole('region', { name: 'Đến ngày ghi' })).not.toBeInTheDocument()
  })
})

// "Tôi đã chuyển" under the block (spec 012, US2): telling the receiver is the first thing a debtor does
describe('the debtor’s next step', () => {
  test('under the total, a primary button per transfer tells the receiver, and the state replaces it', async () => {
    iAm(2)
    const fetchFn = api()
    const user = userEvent.setup()
    renderApp('/households/7')

    const total = (await screen.findByRole('heading', { name: 'Bạn cần trả Tiến' })).nextElementSibling as HTMLElement
    const send = await screen.findByRole('button', { name: 'Tôi đã chuyển 100.000đ cho Tiến' })
    expect(total.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(send)

    // The amount is inside <Money>, so the line is read from its own element
    await waitFor(() =>
      expect(document.querySelector('.debtor-action p')).toHaveTextContent(
        'Đã báo chuyển 100.000đ, chờ Tiến xác nhận.',
      ),
    )
    expect(screen.queryByRole('button', { name: 'Tôi đã chuyển 100.000đ cho Tiến' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Huỷ thông báo' })).toBeInTheDocument()
    const told = fetchFn.mock.calls.find(([url, init]) => url === '/api/households/7/notices' && init?.method === 'PUT')
    expect(JSON.parse(told?.[1]?.body as string)).toEqual({ to_member_id: 1, amount: 100_000, version: null })
  })

  test('a notice already sent shows the state and the way to take it back, with no button', async () => {
    iAm(2)
    api({}, members, [{ from_member_id: 2, to_member_id: 1, amount: 100_000, status: 'sent', created_at: '', version: 1 }])
    renderApp('/households/7')

    await waitFor(() =>
      expect(document.querySelector('.debtor-action p')).toHaveTextContent(
        'Đã báo chuyển 100.000đ, chờ Tiến xác nhận.',
      ),
    )
    expect(screen.queryByRole('button', { name: /^Tôi đã chuyển / })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Huỷ thông báo' })).toBeInTheDocument()
  })

  test('a declined notice says so and offers the button again', async () => {
    iAm(2)
    api({}, members, [{ from_member_id: 2, to_member_id: 1, amount: 100_000, status: 'declined', created_at: '', version: 1 }])
    renderApp('/households/7')

    await waitFor(() =>
      expect(document.querySelector('.debtor-action p')).toHaveTextContent('Tiến báo chưa nhận được 100.000đ.'),
    )
    expect(screen.getByRole('button', { name: 'Tôi đã chuyển 100.000đ cho Tiến' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Huỷ thông báo' })).toBeInTheDocument()
  })

  test('owing two people shows one button each, in the order of the suggestions', async () => {
    iAm(2)
    api({
      'GET /api/households/7/balances': [
        200,
        {
          balances: members.map((m) => ({
            member_id: m.id,
            name: m.name,
            paid: 0,
            owed: 0,
            sent: 0,
            received: 0,
            net: m.id === 1 ? 100_000 : m.id === 2 ? -150_000 : 50_000,
          })),
          suggested: [
            { from_member_id: 2, to_member_id: 1, amount: 100_000 },
            { from_member_id: 2, to_member_id: 3, amount: 50_000 },
          ],
        },
      ],
    })
    renderApp('/households/7')

    const buttons = await screen.findAllByRole('button', { name: /^Tôi đã chuyển / })
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Tôi đã chuyển 100.000đ cho Tiến',
      'Tôi đã chuyển 50.000đ cho An',
    ])
  })

  test('a creditor or a settled person sees no button under the block', async () => {
    iAm(1)
    api()
    const first = renderApp('/households/7')
    await screen.findByRole('heading', { name: 'Bạn được nhận từ Minh và An' })
    expect(screen.queryByRole('button', { name: /^Tôi đã chuyển / })).not.toBeInTheDocument()
    first.unmount()

    api({
      'GET /api/households/7/balances': [
        200,
        {
          balances: members.map((m) => ({
            member_id: m.id,
            name: m.name,
            paid: 0,
            owed: 0,
            sent: 0,
            received: 0,
            net: 0,
          })),
          suggested: [],
        },
      ],
    })
    renderApp('/households/7')
    expect(await screen.findByRole('heading', { name: /^Chưa có khoản chi nào/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Tôi đã chuyển / })).not.toBeInTheDocument()
  })
})

// A house with one person points at the next real step: inviting someone (spec 012, US3)
describe('a house with one person', () => {
  const owner = [members[0]]
  const invite = { code: 'ABCDEFGH', expires_at: '2099-01-01T00:00:00Z' }
  const soloHouse = (requests: unknown[] = [], role: 'owner' | 'member' = 'owner') =>
    api(
      {
        'GET /api/households/7': [200, { ...household, role, member_id: 1 }],
        'GET /api/households/7/members': [200, owner],
        'GET /api/households/7/invite': [200, invite],
        'GET /api/households/7/requests': [200, requests],
      },
      owner,
    )

  test('shows the invite card instead of the empty money sections, and keeps "+ Ghi khoản chi"', async () => {
    soloHouse()
    renderApp('/households/7')

    const card = await screen.findByRole('region', { name: 'Mời bạn cùng phòng' })
    expect(within(card).getByText('ABCD-EFGH')).toBeInTheDocument()
    expect(screen.getByText('Fair-Share có ích khi bạn cùng phòng vào nhà.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Ghi khoản chi' })).toHaveAttribute(
      'href',
      '/households/7/expenses',
    )
    expect(screen.queryByRole('heading', { name: /^Tháng \d+:/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Số dư từng người' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Lịch sử trả tiền' })).not.toBeInTheDocument()
  })

  test('one person waiting for approval is said, with a way to the Members tab', async () => {
    soloHouse([{ household_id: 7, user_id: 9, display_name: 'Lan', requested_at: '' }])
    renderApp('/households/7')

    expect(await screen.findByRole('link', { name: 'Có 1 người đang chờ duyệt' })).toHaveAttribute(
      'href',
      '/households/7/members',
    )
  })

  test('with a second member the page is as today', async () => {
    api()
    renderApp('/households/7')

    expect(await screen.findByRole('region', { name: 'Số dư từng người' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Mời bạn cùng phòng' })).not.toBeInTheDocument()
  })
})

// specs/014 PR-2: telling the amount actually sent, "Báo thêm", and why one transfer to one person
describe('telling a different amount', () => {
  const told = (amount: number, extra: Partial<Notice> = {}): Notice[] => [
    { from_member_id: 2, to_member_id: 1, amount, status: 'sent', created_at: '', version: 1, ...extra },
  ]
  const debtorLine = () => document.querySelector('.debtor-action p')

  test('"Chuyển số khác" tells a smaller amount with a note, and says what is left', async () => {
    iAm(2)
    const fetchFn = api()
    const user = userEvent.setup()
    renderApp('/households/7')

    await user.click(await screen.findByRole('button', { name: 'Chuyển số khác' }))
    const amount = screen.getByLabelText('Số tiền đã chuyển')
    expect(amount).toHaveValue('100000')
    expect(amount).toHaveFocus()
    await user.clear(amount)
    await user.type(amount, '60k')
    expect(screen.getByText('= 60.000đ')).toBeInTheDocument()
    await user.type(within(document.querySelector('.notice-step') as HTMLElement).getByLabelText('Ghi chú (không bắt buộc)'), 'chuyển trước một nửa')
    await user.click(screen.getByRole('button', { name: 'Gửi' }))

    await waitFor(() => expect(debtorLine()).toHaveTextContent('Đã báo 60.000đ, còn thiếu 40.000đ.'))
    expect(screen.getByText('“chuyển trước một nửa”')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Báo thêm' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Số tiền đã chuyển')).not.toBeInTheDocument()
    const put = fetchFn.mock.calls.find(([url, init]) => url === '/api/households/7/notices' && init?.method === 'PUT')
    expect(JSON.parse(put?.[1]?.body as string)).toEqual({
      to_member_id: 1,
      amount: 60_000,
      version: null,
      note: 'chuyển trước một nửa',
    })
  })

  test('more than is owed is refused in the step, before anything is sent', async () => {
    iAm(2)
    const fetchFn = api()
    const user = userEvent.setup()
    renderApp('/households/7')

    await user.click(await screen.findByRole('button', { name: 'Chuyển số khác' }))
    const amount = screen.getByLabelText('Số tiền đã chuyển')
    await user.clear(amount)
    await user.type(amount, '150k{Enter}')
    expect(screen.getByText('Không báo được quá số cần trả lúc này (100.000đ).')).toBeInTheDocument()
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  test('a refusal from the server stays in the step with what was typed', async () => {
    iAm(2)
    api({
      'PUT /api/households/7/notices': [409, { error: { code: 'suggestion_changed', message: 'Số cần trả vừa đổi.' } }],
    })
    const user = userEvent.setup()
    renderApp('/households/7')

    await user.click(await screen.findByRole('button', { name: 'Chuyển số khác' }))
    const amount = screen.getByLabelText('Số tiền đã chuyển')
    await user.clear(amount)
    await user.type(amount, '60k')
    await user.type(within(document.querySelector('.notice-step') as HTMLElement).getByLabelText('Ghi chú (không bắt buộc)'), 'một nửa')
    await user.click(screen.getByRole('button', { name: 'Gửi' }))

    expect(await screen.findByText(/^Số tiền gợi ý vừa đổi/)).toBeInTheDocument()
    expect(screen.getByLabelText('Số tiền đã chuyển')).toHaveValue('60k')
    expect(within(document.querySelector('.notice-step') as HTMLElement).getByLabelText('Ghi chú (không bắt buộc)')).toHaveValue('một nửa')
  })

  test('Escape closes the step and gives the focus back to "Chuyển số khác"', async () => {
    iAm(2)
    api()
    const user = userEvent.setup()
    renderApp('/households/7')

    const opener = await screen.findByRole('button', { name: 'Chuyển số khác' })
    await user.click(opener)
    expect(opener).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText('Số tiền đã chuyển')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  test('"Báo thêm" adds to the same notice, with the sum as it is typed', async () => {
    iAm(2)
    const fetchFn = api({}, members, told(60_000, { note: 'trước' }))
    const user = userEvent.setup()
    renderApp('/households/7')

    await waitFor(() => expect(debtorLine()).toHaveTextContent('Đã báo 60.000đ, còn thiếu 40.000đ.'))
    await user.click(screen.getByRole('button', { name: 'Báo thêm' }))
    const amount = screen.getByLabelText('Số tiền chuyển thêm')
    expect(amount).toHaveValue('40000')
    expect(amount).toHaveAccessibleDescription(/60\.000đ \+ 40\.000đ = 100\.000đ/)
    await user.clear(amount)
    await user.type(amount, '30k')
    expect(screen.getByText('60.000đ + 30.000đ = 90.000đ')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Gửi' }))

    await waitFor(() => expect(debtorLine()).toHaveTextContent('Đã báo 90.000đ, còn thiếu 10.000đ.'))
    // The note was left empty: the old one stays
    expect(screen.getByText('“trước”')).toBeInTheDocument()
    const add = fetchFn.mock.calls.find(([url]) => url === '/api/households/7/notices/1/add')
    expect(JSON.parse(add?.[1]?.body as string)).toEqual({ amount: 30_000, version: 1 })
  })

  test('"Báo thêm" never goes past what is owed now', async () => {
    iAm(2)
    const fetchFn = api({}, members, told(60_000))
    const user = userEvent.setup()
    renderApp('/households/7')

    await user.click(await screen.findByRole('button', { name: 'Báo thêm' }))
    const amount = screen.getByLabelText('Số tiền chuyển thêm')
    await user.clear(amount)
    await user.type(amount, '50k{Enter}')
    expect(screen.getByText('Không báo được quá số cần trả lúc này (100.000đ).')).toBeInTheDocument()
    expect(fetchFn.mock.calls.some(([url]) => url === '/api/households/7/notices/1/add')).toBe(false)
  })

  test('told more than is owed now says "nhiều hơn", with nothing to add', async () => {
    iAm(2)
    api({}, members, told(120_000))
    renderApp('/households/7')

    await waitFor(() =>
      expect(debtorLine()).toHaveTextContent('Đã báo 120.000đ, nhiều hơn số cần trả lúc này 100.000đ.'),
    )
    expect(screen.queryByRole('button', { name: 'Báo thêm' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Huỷ thông báo' })).toBeInTheDocument()
  })

  test('the receiver sees the note and what is owed now, and confirms the told amount', async () => {
    iAm(1)
    api({}, members, told(60_000, { note: 'chuyển trước một nửa' }))
    renderApp('/households/7')

    const card = (await within(await transfers()).findByText(/^Minh cần trả bạn/)).closest('li') as HTMLElement
    expect(card).toHaveTextContent('Minh báo đã chuyển 60.000đ · lúc này Minh cần trả bạn 100.000đ')
    expect(within(card).getByText('“chuyển trước một nửa”')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Xác nhận đã nhận 60.000đ' })).toBeEnabled()
  })

  test('why one transfer to one person: said once, and it opens "Vì sao ra số này?"', async () => {
    iAm(2)
    api()
    const user = userEvent.setup()
    renderApp('/households/7')

    const hint = await screen.findByText(/^Số này đã gộp nợ của cả nhà/)
    expect(screen.getAllByText(/^Số này đã gộp nợ của cả nhà/)).toHaveLength(1)
    const fold = document.querySelector('details.explain-fold') as HTMLDetailsElement
    expect(fold.open).toBe(false)
    await user.click(within(hint).getByRole('button', { name: 'Vì sao ra số này?' }))
    expect(fold.open).toBe(true)
    expect(fold.querySelector('summary')).toHaveFocus()
  })
})

// Plan G2-10: in a house of 5 or more, Tổng quan keeps what is about you and folds the rest of the house
describe('a busy house', () => {
  const six = [
    ...members,
    { id: 4, household_id: 7, name: 'Lan', created_at: '' },
    { id: 5, household_id: 7, name: 'Hoa', created_at: '' },
    { id: 6, household_id: 7, name: 'Khoa', created_at: '' },
  ]
  const nets: Record<number, number> = { 1: 400_000, 2: -100_000, 3: -100_000, 4: -100_000, 5: -50_000, 6: -50_000 }
  const busyBalances: [number, unknown] = [
    200,
    {
      balances: six.map((m) => ({
        member_id: m.id, name: m.name, paid: m.id === 1 ? 400_000 : 0, owed: 0, sent: 0, received: 0, net: nets[m.id],
      })),
      suggested: [2, 3, 4, 5, 6].map((id) => ({ from_member_id: id, to_member_id: 1, amount: -nets[id] })),
    },
  ]
  const settled = {
    id: 30, household_id: 7, from_member_id: 3, to_member_id: 1, amount: 20_000, settled_at: today(), note: null,
    created_at: '', created_by: 9, notice_amount: null,
  }
  const summary = (text: string | RegExp) => screen.getByText(text).closest('details') as HTMLDetailsElement

  beforeEach(() => localStorage.clear())

  test('your part stays in view; the rest of the house folds behind a line that sums it up', async () => {
    iAm(2)
    api(
      { 'GET /api/households/7/balances': busyBalances, 'GET /api/households/7/settlements': [200, [settled]] },
      six,
    )
    renderApp('/households/7')

    const mine = await transfers()
    expect(within(mine).getAllByRole('listitem')).toHaveLength(1)
    expect(within(mine).getByText(/^Bạn cần trả Tiến/)).toBeInTheDocument()
    await screen.findByText('4 lần trả khác trong nhà')
    expect(summary('4 lần trả khác trong nhà').open).toBe(false)

    expect(summary('5 người còn lại').open).toBe(false)
    expect(summary('5 người khác: 1 được nhận, 4 cần trả').open).toBe(false)
    expect(summary(/^1 khoản trả, gần nhất: Hôm nay/).open).toBe(false)
    // Your own rows are not inside the folds
    const balances = region('Số dư từng người')
    const myRow = balances.getByText('Minh').closest('li') as HTMLElement
    expect(myRow.closest('details.fold-more')).toBeNull()
  })

  test('a fold opened stays open on the next visit to this house', async () => {
    iAm(2)
    api({ 'GET /api/households/7/balances': busyBalances }, six)
    const user = userEvent.setup()
    const { unmount } = renderApp('/households/7')
    await user.click(await screen.findByText('5 người khác: 1 được nhận, 4 cần trả'))
    expect(summary('5 người khác: 1 được nhận, 4 cần trả').open).toBe(true)
    unmount()

    api({ 'GET /api/households/7/balances': busyBalances }, six)
    renderApp('/households/7')
    await screen.findByText('5 người khác: 1 được nhận, 4 cần trả')
    expect(summary('5 người khác: 1 được nhận, 4 cần trả').open).toBe(true)
    expect(summary('4 lần trả khác trong nhà').open).toBe(false)
  })

  test('the owner, who is in every transfer, sees them all with nothing folded', async () => {
    iAm(1)
    api({ 'GET /api/households/7/balances': busyBalances }, six)
    renderApp('/households/7')
    expect(within(await transfers()).getAllByRole('listitem')).toHaveLength(5)
    expect(screen.queryByText(/lần trả khác trong nhà/)).not.toBeInTheDocument()
  })

  test('a house of three folds nothing', async () => {
    iAm(2)
    api()
    renderApp('/households/7')
    await screen.findByRole('region', { name: 'Số dư từng người' })
    expect(document.querySelector('.fold-more')).toBeNull()
  })
})

// specs/016-vietqr: Minh owes Tiến; Tiến has (or has not) saved a receiving account
describe('paying by VietQR', () => {
  const withHint = members.map((m) =>
    m.id === 1 ? { ...m, receiving_hint: { bank_name: 'Vietcombank', last4: '6789' } } : { ...m, receiving_hint: null },
  )
  const payment = {
    state: 'ready',
    suggested: 100_000,
    told: null,
    amount: 100_000,
    notice_version: null,
    account: { bank_bin: '970436', bank_name: 'Vietcombank', account_number: '0123456789', holder_name: 'NGUYEN VAN TIEN' },
    message: 'FS NHATROQ7 MINH',
    snapshot: 'aaaaaaaaaaaa',
  }

  test('"Mở mã QR" sits beside the debtor\'s action and opens the code, recording nothing', async () => {
    iAm(2)
    const fetchFn = api({ 'GET /api/households/7/members/1/payment': [200, payment] }, withHint)
    const user = userEvent.setup()
    renderApp('/households/7')

    const open = await screen.findByRole('button', { name: 'Mở mã QR' })
    expect(open.closest('.debtor-action')).not.toBeNull()
    await user.click(open)
    expect(await screen.findByRole('img', { name: 'Mã VietQR chuyển 100.000đ cho Tiến' })).toBeInTheDocument()
    expect(open).toHaveAttribute('aria-expanded', 'true')
    expect(fetchFn.mock.calls.some(([, init]) => ['POST', 'PUT', 'DELETE'].includes(init?.method ?? 'GET'))).toBe(false)

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('img', { name: /^Mã VietQR/ })).not.toBeInTheDocument()
    expect(open).toHaveFocus()
  })

  test('telling the transfer while the code is open closes it, and focus goes to the next step', async () => {
    // Review of #271: the panel must not take the focus back when the notice changes the debtor's line
    iAm(2)
    api({ 'GET /api/households/7/members/1/payment': [200, payment] }, withHint)
    const user = userEvent.setup()
    renderApp('/households/7')

    await user.click(await screen.findByRole('button', { name: 'Mở mã QR' }))
    await screen.findByRole('img', { name: /^Mã VietQR/ })
    await user.click(screen.getByRole('button', { name: 'Chuyển số khác' }))
    const amount = screen.getByLabelText('Số tiền đã chuyển')
    await user.clear(amount)
    await user.type(amount, '60k')
    await user.click(screen.getByRole('button', { name: 'Gửi' }))

    const cancel = await screen.findByRole('button', { name: 'Huỷ thông báo' })
    await waitFor(() => expect(cancel).toHaveFocus())
    expect(screen.queryByRole('img', { name: /^Mã VietQR/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Chuyển cho Tiến bằng mã QR' })).not.toBeInTheDocument()
  })

  test('closed by a refresh while the focus is inside, the focus goes back to "Mở mã QR"', async () => {
    // Review of #271: Tiến answers "Chưa nhận được" while Minh is on a copy button in the panel
    iAm(2)
    let notices: Notice[] = [{ from_member_id: 2, to_member_id: 1, amount: 60_000, status: 'sent', created_at: '', version: 1 }]
    api(
      {
        'GET /api/households/7/members/1/payment': [200, { ...payment, state: 'partly_told', told: 60_000, amount: 40_000 }],
        'GET /api/households/7/notices': () => [200, notices],
      },
      withHint,
    )
    const user = userEvent.setup()
    const { client } = renderApp('/households/7')

    await user.click(await screen.findByRole('button', { name: 'Mở mã QR' }))
    const copy = await screen.findByRole('button', { name: 'Sao chép Số tài khoản' })
    copy.focus()
    notices = [{ ...notices[0], status: 'declined', version: 2 }]
    await act(() => client.refetchQueries({ queryKey: ['households', 7, 'notices'] }))

    await waitFor(() => expect(screen.queryByRole('img', { name: /^Mã VietQR/ })).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mở mã QR' })).toHaveFocus())
  })

  test('a receiver without an account: a quiet line, no button', async () => {
    iAm(2)
    api({}, members.map((m) => ({ ...m, receiving_hint: null })))
    renderApp('/households/7')
    expect(await screen.findByText('Tiến chưa thêm tài khoản nhận tiền.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mở mã QR' })).not.toBeInTheDocument()
  })

  test('a waiting notice that covers the debt: no button', async () => {
    iAm(2)
    api({}, withHint, [{ from_member_id: 2, to_member_id: 1, amount: 100_000, status: 'sent', created_at: '', version: 1 }])
    renderApp('/households/7')
    await screen.findByRole('button', { name: 'Huỷ thông báo' })
    expect(screen.queryByRole('button', { name: 'Mở mã QR' })).not.toBeInTheDocument()
    expect(screen.queryByText(/chưa thêm tài khoản nhận tiền/)).not.toBeInTheDocument()
  })

  test('told part of it: the button stays for the rest', async () => {
    iAm(2)
    api({}, withHint, [{ from_member_id: 2, to_member_id: 1, amount: 60_000, status: 'sent', created_at: '', version: 1 }])
    renderApp('/households/7')
    expect(await screen.findByRole('button', { name: 'Mở mã QR' })).toBeInTheDocument()
  })
})


// specs/018-safe-saves, User Story 1: money actions on Tổng quan say only what is known
describe('money actions with no connection, or with no answer', () => {
  afterEach(() => vi.restoreAllMocks())
  const lost = () => Promise.reject(new TypeError('Failed to fetch'))

  test('"Tôi đã chuyển" offline: nothing is sent and the panel says so', async () => {
    iAm(2)
    const fetchFn = api()
    const user = userEvent.setup()
    renderApp('/households/7')
    const button = await screen.findByRole('button', { name: 'Tôi đã chuyển 100.000đ cho Tiến' })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await user.click(button)
    expect(await screen.findByText('Chưa báo được: bạn đang mất mạng.')).toBeInTheDocument()
    expect(fetchFn.mock.calls.some(([url, init]) => url === '/api/households/7/notices' && init?.method === 'PUT')).toBe(false)
  })

  test('"Xác nhận đã nhận" with no answer: it may already be recorded', async () => {
    api({ 'POST /api/households/7/settlements': lost })
    const user = userEvent.setup()
    renderApp('/households/7')
    const card = within(await transfers()).getAllByRole('listitem')[0]
    await user.click(within(card).getByRole('button', { name: 'Xác nhận đã nhận 100.000đ' }))
    expect(
      await screen.findByText('Chưa nhận được kết quả. Có thể đã ghi rồi, xem lại thẻ trước khi bấm lại.'),
    ).toBeInTheDocument()
  })

  test('"Hoàn tác" with no answer: its own line, never after "Chưa hoàn tác được"', async () => {
    api({ 'DELETE /api/settlements/30': lost })
    const user = userEvent.setup()
    renderApp('/households/7')
    const card = within(await transfers()).getAllByRole('listitem')[0]
    await user.click(within(card).getByRole('button', { name: 'Xác nhận đã nhận 100.000đ' }))
    const toast = (await screen.findByText(/^Đã ghi:/)).closest('.toast') as HTMLElement
    await user.click(within(toast).getByRole('button', { name: 'Hoàn tác' }))
    expect(
      await screen.findByText('Chưa nhận được kết quả. Có thể đã hoàn tác rồi, xem lại thẻ trước khi bấm lại.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^Chưa hoàn tác được:.*Chưa nhận được/)).toBeNull()
  })
})

// specs/018-safe-saves, User Story 2: "Nhận số khác" stays open with what was typed until it is recorded
describe('"Nhận số khác" while it is sent, and when it fails', () => {
  afterEach(() => vi.restoreAllMocks())

  test('a failure keeps the step open with the amount, and says why inside it', async () => {
    let answer: (reply: [number, unknown?]) => void = () => {}
    api({ 'POST /api/households/7/notices/2/accept': () => new Promise((resolve) => (answer = resolve)) }, members, [
      { from_member_id: 2, to_member_id: 1, amount: 100_000, status: 'sent', created_at: '', version: 7 },
    ])
    const user = userEvent.setup()
    renderApp('/households/7')
    const card = within(await transfers()).getAllByRole('listitem')[0]
    await within(card).findByText(/Minh báo đã chuyển/)
    await user.click(within(card).getByRole('button', { name: 'Nhận số khác' }))
    const field = within(card).getByLabelText('Số tiền đã nhận')
    await user.clear(field)
    await user.type(field, '60k')
    await user.click(within(card).getByRole('button', { name: 'Ghi số này' }))

    // On its way: still open, and nothing in it changes or closes it
    const sending = await screen.findByLabelText('Số tiền đã nhận')
    // The amount that was sent, written out (the step is drawn again while it is sent)
    expect(sending).toHaveValue('60000')
    expect(sending).toHaveAttribute('readonly')
    await user.keyboard('{Escape}')
    expect(screen.getByLabelText('Số tiền đã nhận')).toBeInTheDocument()

    answer([409, { error: { code: 'notice_changed', message: 'x' } }])
    await waitFor(() => expect(screen.getByLabelText('Số tiền đã nhận')).not.toHaveAttribute('readonly'))
    const again = screen.getByLabelText('Số tiền đã nhận')
    expect(again).toHaveValue('60000')
    expect(again).toHaveAccessibleDescription(/./)
    // After a failure it can be closed again
    await user.click(screen.getByRole('button', { name: 'Huỷ' }))
    expect(screen.queryByLabelText('Số tiền đã nhận')).not.toBeInTheDocument()
  })
})
