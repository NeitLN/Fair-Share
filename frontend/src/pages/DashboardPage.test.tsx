import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { Settlement, SettlementInput } from '../api/types'
import { today } from '../lib/date'
import { mockApi, renderApp } from '../test/renderApp'

beforeEach(() => {
  // The user answers "OK" to "Xoá khoản …?"
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
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

const iAm = (memberId: number) => localStorage.setItem('fair-share:me:7', String(memberId))
const transfers = () => screen.findByRole('list', { name: 'Các lần trả gợi ý' })
const region = (name: string) => within(screen.getByRole('region', { name }))
const month = Number(today().slice(5, 7))

test('without an identity the block counts the transfers left, and lists them all', async () => {
  api()
  renderApp('/households/7')

  expect(await screen.findByRole('heading', { name: 'Còn 2 lần trả là cả nhà về 0đ' })).toBeInTheDocument()
  expect(await screen.findByText(`Tháng ${month}`, { exact: false })).toHaveTextContent(
    `Tháng ${month} · cả nhà đã chi 300.000đ`,
  )
  const rows = within(await transfers()).getAllByRole('listitem')
  expect(rows.map((row) => row.querySelector('.transfer-text')?.textContent)).toEqual([
    'Minh trả Tiến 100.000đ',
    'An trả Tiến 100.000đ',
  ])
  expect(within(rows[0]).getByRole('button', { name: 'Đã trả' })).toHaveAccessibleDescription(
    'Minh trả Tiến 100.000đ',
  )
})

test('someone who owes sees who to pay and how much, as "Bạn"', async () => {
  iAm(2)
  api()
  renderApp('/households/7')

  const sentence = await screen.findByRole('heading', { name: 'Bạn cần trả Tiến' })
  expect(sentence.nextElementSibling).toHaveTextContent('100.000đ')
  expect(within(await transfers()).getByText(/^Bạn trả Tiến/)).toBeInTheDocument()
})

test('someone who is owed sees who pays them, and the total', async () => {
  iAm(1)
  api()
  renderApp('/households/7')

  const sentence = await screen.findByRole('heading', { name: 'Bạn được nhận từ Minh và An' })
  expect(sentence.nextElementSibling).toHaveTextContent('200.000đ')
  expect(within(await transfers()).getByText(/^Minh trả bạn/)).toBeInTheDocument()
})

test('every member has a row with where they stand, in words and with a sign', async () => {
  iAm(1)
  api()
  renderApp('/households/7')

  const rows = await within(screen.getByRole('region', { name: 'Số dư từng người' })).findAllByRole('listitem')
  expect(rows[0]).toHaveTextContent(/Tiếnbạnđã chi 300\.000đ\+200\.000đđược nhận$/)
  expect(rows[1]).toHaveTextContent(/Minh−100\.000đcần trả$/)
  expect(rows[2]).toHaveTextContent(/An−100\.000đcần trả$/)
})

test('"Đã trả" records the suggested transfer, paid today', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: 'Đã trả' })[0])

  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Đã trả' })).toHaveLength(1))
  expect(
    await region('Lịch sử trả').findByRole('button', { name: /^Xoá khoản Minh trả Tiến/ }),
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

  await user.click(within(await transfers()).getAllByRole('button', { name: 'Đã trả' })[0])
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Đã trả' })).toHaveLength(1))
  await user.click(screen.getByRole('button', { name: 'Đã trả' }))

  expect(await screen.findByRole('heading', { name: 'Cả nhà sạch nợ. Nhà trọ bình yên.' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Sao chép tin nhắn nhắc nợ' })).not.toBeInTheDocument()
  expect(region('Số dư từng người').getAllByText('SẠCH NỢ')).toHaveLength(3)
})

test('a payment that is not a suggestion is recorded with the folded form', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  const history = region('Lịch sử trả')
  await user.click(await history.findByText('Ghi khoản trả khác'))
  await user.selectOptions(history.getByLabelText('Người trả'), 'An')
  await user.selectOptions(history.getByLabelText('Người nhận'), 'Tiến')
  await user.type(history.getByLabelText('Số tiền (đồng)'), '40k')
  await user.click(history.getByRole('button', { name: 'Ghi nhận khoản trả' }))

  expect(await history.findByText(/40\.000/)).toBeInTheDocument()
  // An still owes 60 000
  await waitFor(() =>
    expect(within(screen.getByRole('list', { name: 'Các lần trả gợi ý' })).getByText(/^An trả Tiến/)).toHaveTextContent(
      'An trả Tiến 60.000đ',
    ),
  )
})

test('a mistaken payment can be deleted, and the debt comes back', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: 'Đã trả' })[0])
  const history = region('Lịch sử trả')
  await user.click(await history.findByRole('button', { name: /^Xoá khoản Minh trả Tiến/ }))

  expect(await history.findByText(/^Chưa có khoản trả nào/)).toBeInTheDocument()
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Đã trả' })).toHaveLength(2))
})

test('the reminder goes to the clipboard, ready for the group chat', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(await screen.findByRole('button', { name: 'Sao chép tin nhắn nhắc nợ' }))

  expect(await navigator.clipboard.readText()).toBe(
    [
      `Nhà 7 chốt sổ tháng ${month} nè:`,
      '• Minh trả Tiến 100.000đ',
      '• An trả Tiến 100.000đ',
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
  expect(text.value).toMatch(/^Nhà 7 chốt sổ tháng \d+ nè:\n• Minh trả Tiến 100\.000đ/)
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
  expect(rows[0]).toHaveTextContent('Minh trả Tiến 100.000đ')
  expect(screen.queryByText(/Thành viên đã xoá/)).not.toBeInTheDocument()
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

  const summary = await region('Lịch sử trả').findByText('Ghi khoản trả khác')
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

  await user.click(within(await transfers()).getAllByRole('button', { name: 'Đã trả' })[0])

  const status = screen.getByRole('status')
  expect(await within(status).findByText('Đã ghi: Minh trả Tiến 100.000đ')).toBeInTheDocument()
  const rows = within(screen.getByRole('list', { name: 'Các lần trả gợi ý' })).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(rows[0]).toHaveTextContent('Minh trả Tiến 100.000đ')
  expect(within(rows[0]).getByText('ĐÃ TRẢ')).toBeInTheDocument()
  // Keyboard focus moved from the pressed button to this card's Hoàn tác
  expect(within(rows[0]).getByRole('button', { name: 'Hoàn tác' })).toHaveFocus()
  expect(within(rows[1]).getByRole('button', { name: 'Đã trả' })).toBeInTheDocument()
})

test('Hoàn tác in the toast deletes exactly the payment that was recorded', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: 'Đã trả' })[0])
  const status = screen.getByRole('status')
  await user.click(await within(status).findByRole('button', { name: 'Hoàn tác' }))

  expect(await within(status).findByText('Đã hoàn tác: Minh trả Tiến 100.000đ')).toBeInTheDocument()
  const deletes = fetchFn.mock.calls.filter(([, init]) => init?.method === 'DELETE')
  expect(deletes.map(([url]) => url)).toEqual(['/api/settlements/30'])
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Đã trả' })).toHaveLength(2))
  expect(screen.queryByText('ĐÃ TRẢ')).not.toBeInTheDocument()
})

test('a double click records the transfer once', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7')

  const button = within(await transfers()).getAllByRole('button', { name: 'Đã trả' })[0]
  await user.dblClick(button)

  expect(await screen.findByText('ĐÃ TRẢ')).toBeInTheDocument()
  expect(fetchFn.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

test('undoing twice, from the card and the toast, deletes once', async () => {
  const fetchFn = api()
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: 'Đã trả' })[0])
  const toastUndo = await within(screen.getByRole('status')).findByRole('button', { name: 'Hoàn tác' })
  const cardUndo = within(screen.getByRole('list', { name: 'Các lần trả gợi ý' })).getByRole('button', {
    name: 'Hoàn tác',
  })
  await user.click(cardUndo)
  await user.click(toastUndo)

  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Đã trả' })).toHaveLength(2))
  expect(fetchFn.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1)
})

test('undoing a payment that was already deleted says so and drops the stamp', async () => {
  api({ 'DELETE /api/settlements/30': [404, { error: { code: 'settlement_not_found', message: 'gone' } }] })
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: 'Đã trả' })[0])
  await user.click(await within(screen.getByRole('status')).findByRole('button', { name: 'Hoàn tác' }))

  expect(await screen.findByText('Khoản trả này đã được xoá trước đó.')).toBeInTheDocument()
  expect(screen.queryByText('ĐÃ TRẢ')).not.toBeInTheDocument()
})

test('a failed undo keeps the stamp and offers Thử lại', async () => {
  api({ 'DELETE /api/settlements/30': [503, { error: { code: 'database_unavailable', message: 'down' } }] })
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: 'Đã trả' })[0])
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

  await user.click(within(await transfers()).getAllByRole('button', { name: 'Đã trả' })[0])

  expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ tạm thời không kết nối được dữ liệu.')
  expect(screen.getAllByRole('button', { name: 'Đã trả' })).toHaveLength(2)
  expect(screen.queryByText('ĐÃ TRẢ')).not.toBeInTheDocument()
})

test('deleting the recorded payment from the history removes its stamped card', async () => {
  api()
  const user = userEvent.setup()
  renderApp('/households/7')

  await user.click(within(await transfers()).getAllByRole('button', { name: 'Đã trả' })[0])
  expect(await screen.findByText('ĐÃ TRẢ')).toBeInTheDocument()
  await user.click(await region('Lịch sử trả').findByRole('button', { name: /^Xoá khoản Minh trả Tiến/ }))

  await waitFor(() => expect(screen.queryByText('ĐÃ TRẢ')).not.toBeInTheDocument())
  expect(screen.getAllByRole('button', { name: 'Đã trả' })).toHaveLength(2)
})
