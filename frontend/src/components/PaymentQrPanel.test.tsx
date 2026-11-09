import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { PaymentDetails } from '../api/types'
import { mockApi } from '../test/renderApp'
import PaymentQrPanel from './PaymentQrPanel'

const URL = '/api/households/7/members/2/payment'
const account = {
  bank_bin: '970436',
  bank_name: 'Vietcombank',
  account_number: '0123456789',
  holder_name: 'NGUYEN VAN MINH',
}
const ready: PaymentDetails = {
  state: 'ready',
  suggested: 120_000,
  told: null,
  amount: 120_000,
  notice_version: null,
  account,
  message: 'FS NHATROQ7 LAN',
  snapshot: 'aaaaaaaaaaaa',
}

let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function show(onClose = vi.fn()) {
  const view = render(
    <QueryClientProvider client={client}>
      <PaymentQrPanel householdId={7} memberId={2} to="Minh" onClose={onClose} />
    </QueryClientProvider>,
  )
  return { ...view, onClose }
}

const code = () => screen.queryByRole('img', { name: /^Mã VietQR/ })

test('ready: the code, the five details with copy buttons, and the line to compare the name', async () => {
  mockApi({ [`GET ${URL}`]: [200, ready] })
  show()
  expect(await screen.findByRole('img', { name: 'Mã VietQR chuyển 120.000đ cho Minh' })).toBeInTheDocument()
  for (const text of ['Vietcombank', '0123456789', 'NGUYEN VAN MINH', '120.000đ', 'FS NHATROQ7 LAN']) {
    expect(screen.getByText(text)).toBeInTheDocument()
  }
  expect(screen.getAllByRole('button', { name: /^Sao chép/ })).toHaveLength(5)
  expect(screen.getByText('(tên Minh tự nhập)')).toBeInTheDocument()
  expect(screen.getByText('So tên người nhận trong app ngân hàng trước khi xác nhận.')).toBeInTheDocument()
})

test('partly told: what is owed, what was told and what is left', async () => {
  mockApi({ [`GET ${URL}`]: [200, { ...ready, state: 'partly_told', told: 100_000, amount: 20_000, notice_version: 5 }] })
  show()
  expect(await screen.findByText('120.000đ cần trả, đã báo 100.000đ, còn 20.000đ chưa báo.')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Mã VietQR chuyển 20.000đ cho Minh' })).toBeInTheDocument()
})

test('the code without an amount is a choice, says so, and goes back', async () => {
  mockApi({ [`GET ${URL}`]: [200, ready] })
  const user = userEvent.setup()
  show()
  await user.click(await screen.findByRole('button', { name: 'Mã không kèm số tiền' }))
  expect(screen.getByRole('img', { name: 'Mã VietQR chuyển cho Minh, không kèm số tiền' })).toBeInTheDocument()
  expect(screen.getByText(/^Không kèm số tiền: bạn nhập số tiền/)).toBeInTheDocument()
  expect(screen.getByText('Số tiền tham khảo')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Mã kèm số tiền' }))
  expect(screen.getByRole('img', { name: 'Mã VietQR chuyển 120.000đ cho Minh' })).toBeInTheDocument()
})

test('declined: the warning first, no code until "Vẫn chuyển", which asks again with the notice', async () => {
  const api = mockApi({
    [`GET ${URL}`]: [200, { ...ready, state: 'declined', told: 100_000, amount: null, notice_version: 9, account: null, message: null }],
    [`GET ${URL}?acknowledge=9`]: [200, { ...ready, state: 'declined_acknowledged', told: 100_000, notice_version: 9 }],
  })
  const user = userEvent.setup()
  show()
  expect(await screen.findByText('Minh báo chưa nhận được 100.000đ. Xem lại app ngân hàng trước khi chuyển nữa.')).toBeInTheDocument()
  expect(code()).toBeNull()
  expect(screen.queryByRole('button', { name: 'Mã không kèm số tiền' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Vẫn chuyển 120.000đ' }))
  expect(await screen.findByRole('img', { name: 'Mã VietQR chuyển 120.000đ cho Minh' })).toBeInTheDocument()
  expect(api.mock.calls.some(([url]) => url === `${URL}?acknowledge=9`)).toBe(true)
})

test.each([
  ['covered', [200, { ...ready, state: 'covered', amount: null, account: null, message: null }]],
  ['no account', [200, { ...ready, state: 'no_account', amount: null, account: null, message: null }]],
  ['409', [409, { error: { code: 'payment_not_suggested', message: 'x' } }]],
  ['404', [404, { error: { code: 'member_not_found', message: 'x' } }]],
] as const)('%s: no code and no detail', async (_name, answer) => {
  mockApi({ [`GET ${URL}`]: answer as [number, unknown] })
  show()
  expect(await screen.findByText('Không còn mã cho lần trả này.')).toBeInTheDocument()
  expect(code()).toBeNull()
  expect(screen.queryByText('0123456789')).toBeNull()
})

test('too large: the details as text, no code, and why', async () => {
  mockApi({ [`GET ${URL}`]: [200, { ...ready, state: 'too_large', amount: 600_000_000 }] })
  show()
  expect(await screen.findByText(/^Số tiền từ 500\.000\.000đ vượt mức/)).toBeInTheDocument()
  expect(code()).toBeNull()
  expect(screen.getByText('0123456789')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Mã không kèm số tiền' })).toBeNull()
})

test('a refresh with another snapshot drops the code and every detail until loaded again', async () => {
  let answer: PaymentDetails = ready
  mockApi({ [`GET ${URL}`]: () => [200, answer] })
  const user = userEvent.setup()
  show()
  await screen.findByRole('img', { name: /^Mã VietQR chuyển 120\.000đ/ })
  answer = { ...ready, amount: 90_000, suggested: 90_000, snapshot: 'bbbbbbbbbbbb' }
  await act(() => client.refetchQueries({ queryKey: ['payment', 7, 2] }))
  expect(await screen.findByText('Số tiền hoặc tài khoản vừa đổi.')).toBeInTheDocument()
  expect(code()).toBeNull()
  expect(screen.queryByText('0123456789')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Tải lại' }))
  expect(await screen.findByRole('img', { name: 'Mã VietQR chuyển 90.000đ cho Minh' })).toBeInTheDocument()
})

test('a refused clipboard selects the value so it can be copied by hand', async () => {
  mockApi({ [`GET ${URL}`]: [200, ready] })
  const user = userEvent.setup() // installs its own clipboard: refuse it after
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('no'))
  show()
  await user.click(await screen.findByRole('button', { name: 'Sao chép Số tài khoản' }))
  await waitFor(() => expect(window.getSelection()?.toString()).toBe('0123456789'))
})

test('copying says so', async () => {
  mockApi({ [`GET ${URL}`]: [200, ready] })
  const user = userEvent.setup()
  const writeText = vi.spyOn(navigator.clipboard, 'writeText')
  show()
  const button = await screen.findByRole('button', { name: 'Sao chép Số tài khoản' })
  await user.click(button)
  expect(writeText).toHaveBeenCalledWith('0123456789')
  expect(await within(button).findByText('Đã chép')).toBeInTheDocument()
})

test('Escape and Đóng close; closing drops the details from memory', async () => {
  mockApi({ [`GET ${URL}`]: [200, ready] })
  const user = userEvent.setup()
  const { onClose, unmount } = show()
  await screen.findByRole('img', { name: /^Mã VietQR/ })
  await user.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Đóng' }))
  expect(onClose).toHaveBeenCalledTimes(2)
  unmount()
  expect(client.getQueryCache().findAll({ queryKey: ['payment', 7, 2] })).toHaveLength(0)
})

test('only GETs to the payment route: nothing is recorded', async () => {
  const api = mockApi({ [`GET ${URL}`]: [200, ready] })
  const user = userEvent.setup()
  show()
  await user.click(await screen.findByRole('button', { name: 'Mã không kèm số tiền' }))
  for (const [url, init] of api.mock.calls) {
    expect((init as RequestInit | undefined)?.method ?? 'GET').toBe('GET')
    expect(String(url).startsWith(URL)).toBe(true)
  }
})
