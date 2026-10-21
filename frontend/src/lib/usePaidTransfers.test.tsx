import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { balancesFetchCount } from '../api/settlements'
import type { Balances, Transfer } from '../api/types'
import { ToastProvider } from '../components/Toast'
import { usePaidTransfers } from './usePaidTransfers'

// A fetch whose answers the test hands out one by one, to put requests in any order
type Pending = { method: string; url: string; answer: (status: number, body?: unknown) => void }
let pending: Pending[] = []

beforeEach(() => {
  pending = []
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string, init: RequestInit = {}) =>
        new Promise<Response>((resolve) => {
          pending.push({
            method: init.method ?? 'GET',
            url,
            answer: (status, body) =>
              resolve(
                status === 204
                  ? new Response(null, { status })
                  : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
              ),
          })
        }),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const a: Transfer = { from_member_id: 2, to_member_id: 1, amount: 100_000 }
const b: Transfer = { from_member_id: 3, to_member_id: 1, amount: 50_000 }
// Balances asked for before anything was recorded (stale), or after (fresh)
const balances = (suggested: Transfer[], fresh = false): Balances => ({
  balances: [],
  suggested,
  fetchCount: balancesFetchCount() + (fresh ? 1 : 0),
})
const settlement = (id: number, t: Transfer) => ({ id, household_id: 7, settled_at: '', note: null, created_at: '', ...t })
const requests = (method: string) => pending.filter((p) => p.method === method)
const answer = async (request: Pending, status: number, body?: unknown) => {
  await act(async () => {
    request.answer(status, body)
  })
}

function setup(initial: Balances, describe = (t: Transfer) => `${t.from_member_id} trả ${t.to_member_id}`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
  return renderHook(({ data, name }) => usePaidTransfers(7, data, name), {
    wrapper,
    initialProps: { data: initial, name: describe },
  })
}

test('two presses in the same tick send one request', () => {
  const { result } = setup(balances([a]))
  act(() => {
    result.current.pay(a, null)
    result.current.pay(a, null)
  })
  expect(requests('POST')).toHaveLength(1)
})

test('two undos in the same tick send one delete', async () => {
  const { result } = setup(balances([a]))
  act(() => {
    result.current.pay(a, null)
  })
  await answer(requests('POST')[0], 201, settlement(30, a))
  const id = result.current.cards[0].paymentId as number
  act(() => {
    result.current.undo(id)
    result.current.undo(id)
  })
  expect(requests('DELETE').map((r) => r.url)).toEqual(['/api/settlements/30'])
})

test('until balances asked for after the payment arrive, the paid transfer cannot be pressed again', async () => {
  const { result, rerender } = setup(balances([a, b]))
  act(() => {
    result.current.pay(a, 'open-3-1')
  })
  await answer(requests('POST')[0], 201, settlement(30, a))

  // A refetch that started before the payment still lists it: it stays hidden, only the stamp shows
  rerender({ data: balances([a, b]), name: (t) => String(t.amount) })
  expect(result.current.cards.map((c) => [c.key.split('-')[0], c.state])).toEqual([
    ['pay', 'paid'],
    ['open', 'open'],
  ])
  expect(result.current.outstanding).toEqual([b])

  // Balances asked for afterwards are the truth: a new debt between the same two people is payable
  rerender({ data: balances([{ ...a, amount: 20_000 }, b], true), name: (t) => String(t.amount) })
  expect(result.current.outstanding).toEqual([{ ...a, amount: 20_000 }, b])
})

test('a pending card keeps what was pressed when the suggestions change under it', () => {
  const { result, rerender } = setup(balances([a, b]))
  act(() => {
    result.current.pay(a, 'open-3-1')
  })
  rerender({ data: balances([b]), name: (t) => String(t.amount) })
  expect(result.current.cards).toEqual([
    expect.objectContaining({ state: 'paying', transfer: a }),
    expect.objectContaining({ key: 'open-3-1', state: 'open' }),
  ])
})

test('stamped cards keep the order they were pressed in, even when both were first', async () => {
  const { result, rerender } = setup(balances([a, b]))
  act(() => {
    result.current.pay(a, 'open-3-1')
  })
  // a's suggestion disappears while it is pending; b is now first, and is pressed there
  rerender({ data: balances([b]), name: (t) => String(t.amount) })
  act(() => {
    result.current.pay(b, null)
  })
  await answer(requests('POST')[1], 201, settlement(31, b))
  await answer(requests('POST')[0], 201, settlement(30, a))
  rerender({ data: balances([], true), name: (t) => String(t.amount) })

  expect(result.current.cards.map((c) => c.transfer)).toEqual([a, b])
})

test('a payment deleted from the history before its answer arrives is never stamped', async () => {
  const { result } = setup(balances([a]))
  act(() => {
    result.current.pay(a, null)
  })
  act(() => {
    result.current.forget(30)
  })
  await answer(requests('POST')[0], 201, settlement(30, a))

  expect(result.current.cards.some((c) => c.state === 'paid')).toBe(false)
  expect(screen.queryByText(/^Đã ghi/)).not.toBeInTheDocument()
})

test('the toast names the transfer the way it reads when the toast is shown', async () => {
  const { result, rerender } = setup(balances([a]), () => 'Bạn trả Tiến')
  act(() => {
    result.current.pay(a, null)
  })
  // "Bạn là ai?" changed while the request was on its way
  rerender({ data: balances([a]), name: () => 'Minh trả Tiến' })
  await answer(requests('POST')[0], 201, settlement(30, a))

  expect(screen.getByText('Đã ghi: Minh trả Tiến 100.000đ')).toBeInTheDocument()
})

test('Thử lại after a failed undo deletes the same settlement, and the card goes', async () => {
  const { result } = setup(balances([a]))
  act(() => {
    result.current.pay(a, null)
  })
  await answer(requests('POST')[0], 201, settlement(30, a))
  act(() => {
    result.current.undo(result.current.cards[0].paymentId as number)
  })
  await answer(requests('DELETE')[0], 503, { error: { code: 'database_unavailable', message: 'down' } })
  expect(result.current.cards[0].state).toBe('paid')

  await act(async () => {
    screen.getByRole('button', { name: 'Thử lại' }).click()
  })
  await answer(requests('DELETE')[1], 204)

  expect(requests('DELETE').map((r) => r.url)).toEqual(['/api/settlements/30', '/api/settlements/30'])
  // Undone: the stamped card is gone and the debt is back as a suggestion
  expect(result.current.cards.map((c) => c.state)).toEqual(['open'])
  expect(screen.getByText(/^Đã hoàn tác/)).toBeInTheDocument()
})

test('leaving the household takes its Hoàn tác toasts away, and a late answer shows nothing', async () => {
  const { result, unmount } = setup(balances([a, b]))
  act(() => {
    result.current.pay(a, null)
  })
  await answer(requests('POST')[0], 201, settlement(30, a))
  act(() => {
    result.current.pay(b, null)
  })
  expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeInTheDocument()

  unmount()
  render(<ToastProvider>{null}</ToastProvider>)
  await answer(requests('POST')[1], 201, settlement(31, b))
  expect(screen.queryByText(/^Đã ghi/)).not.toBeInTheDocument()
})
