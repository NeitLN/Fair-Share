import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { balancesFetchCount, getBalances, settlementKeys } from '../api/settlements'
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
    result.current.pay(a)
    result.current.pay(a)
  })
  expect(requests('POST')).toHaveLength(1)
})

test('two undos in the same tick send one delete', async () => {
  const { result } = setup(balances([a]))
  act(() => {
    result.current.pay(a)
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
    result.current.pay(a)
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
    result.current.pay(a)
  })
  rerender({ data: balances([b]), name: (t) => String(t.amount) })
  expect(result.current.cards).toEqual([
    expect.objectContaining({ state: 'paying', transfer: a }),
    expect.objectContaining({ key: 'open-3-1', state: 'open' }),
  ])
})

const c: Transfer = { from_member_id: 4, to_member_id: 1, amount: 20_000 }
const permutations = <T,>(items: T[]): T[][] =>
  items.length <= 1 ? [items] : items.flatMap((item, i) => permutations(items.filter((_, j) => j !== i)).map((rest) => [item, ...rest]))

test.each(permutations([0, 1, 2]))(
  'stamped cards stay in the order A, B, C whatever order they are paid in (%s, %s, %s), answers reversed',
  async (...pressOrder) => {
    const transfers = [a, b, c]
    const { result, rerender } = setup(balances(transfers))
    let open = [...transfers]
    for (const index of pressOrder) {
      act(() => {
        result.current.pay(transfers[index])
      })
      // The suggestion of each paid transfer is gone from the next balances
      open = open.filter((t) => t !== transfers[index])
      rerender({ data: balances(open), name: (t) => String(t.amount) })
    }
    for (const post of [...requests('POST')].reverse()) {
      const index = requests('POST').indexOf(post)
      await answer(post, 201, settlement(30 + index, transfers[pressOrder[index]]))
    }
    rerender({ data: balances([], true), name: (t) => String(t.amount) })

    expect(result.current.cards.map((card) => [card.transfer, card.state])).toEqual([
      [a, 'paid'],
      [b, 'paid'],
      [c, 'paid'],
    ])
  },
)

test('two presses in one batch both keep their place, before and after reversed answers', async () => {
  const { result, rerender } = setup(balances([a, b, c]))
  act(() => {
    result.current.pay(a)
    result.current.pay(b)
  })
  expect(result.current.cards.map((card) => [card.transfer, card.state])).toEqual([
    [a, 'paying'],
    [b, 'paying'],
    [c, 'open'],
  ])
  await answer(requests('POST')[1], 201, settlement(31, b))
  await answer(requests('POST')[0], 201, settlement(30, a))
  rerender({ data: balances([c], true), name: (t) => String(t.amount) })
  expect(result.current.cards.map((card) => [card.transfer, card.state])).toEqual([
    [a, 'paid'],
    [b, 'paid'],
    [c, 'open'],
  ])
})

test('a new suggestion appears after the one before it in the API order', () => {
  const { result, rerender } = setup(balances([a, c]))
  rerender({ data: balances([a, b, c], true), name: (t) => String(t.amount) })
  expect(result.current.cards.map((card) => card.transfer)).toEqual([a, b, c])
})

test('balances that did not come through getBalances count as old: a paid pair stays hidden', async () => {
  const { result, rerender } = setup(balances([a]))
  act(() => {
    result.current.pay(a)
  })
  await answer(requests('POST')[0], 201, settlement(30, a))
  rerender({ data: { balances: [], suggested: [a] }, name: (t) => String(t.amount) })
  expect(result.current.outstanding).toEqual([])
})

test('a payment deleted from the history before its answer arrives is never stamped', async () => {
  const { result } = setup(balances([a]))
  act(() => {
    result.current.pay(a)
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
    result.current.pay(a)
  })
  // "Bạn là ai?" changed while the request was on its way
  rerender({ data: balances([a]), name: () => 'Minh trả Tiến' })
  await answer(requests('POST')[0], 201, settlement(30, a))

  expect(screen.getByText('Đã ghi: Minh trả Tiến 100.000đ')).toBeInTheDocument()
})

test('Thử lại after a failed undo deletes the same settlement, and the card goes', async () => {
  const { result } = setup(balances([a]))
  act(() => {
    result.current.pay(a)
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
  // One toast area for the whole app, as in App.tsx; only the household's part goes away
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let hook: ReturnType<typeof usePaidTransfers> | undefined
  const data = balances([a, b])
  function Household() {
    const result = usePaidTransfers(7, data, (t) => `${t.from_member_id} trả ${t.to_member_id}`)
    useEffect(() => {
      hook = result
    })
    return null
  }
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Household />
      </ToastProvider>
    </QueryClientProvider>,
  )
  act(() => {
    hook?.pay(a)
  })
  await answer(requests('POST')[0], 201, settlement(30, a))
  act(() => {
    hook?.pay(b)
  })
  expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeInTheDocument()

  // Another household: the same provider stays, the dashboard is replaced
  view.rerender(
    <QueryClientProvider client={client}>
      <ToastProvider>{null}</ToastProvider>
    </QueryClientProvider>,
  )
  expect(screen.queryByRole('button', { name: 'Hoàn tác' })).not.toBeInTheDocument()
  await answer(requests('POST')[1], 201, settlement(31, b))
  expect(screen.queryByText(/^Đã ghi/)).not.toBeInTheDocument()
})

test('with the real balances query: a request that started before the payment never brings it back', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let hook: ReturnType<typeof usePaidTransfers> | undefined
  function Dashboard() {
    const query = useQuery({ queryKey: settlementKeys.balances(7), queryFn: () => getBalances(7) })
    const result = usePaidTransfers(7, query.data, (t) => `${t.from_member_id} trả ${t.to_member_id}`)
    useEffect(() => {
      hook = result
    })
    return null
  }
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Dashboard />
      </ToastProvider>
    </QueryClientProvider>,
  )
  const gets = () => requests('GET')
  await answer(gets()[0], 200, { balances: [], suggested: [a, b] })
  // React Query hands the data over a tick later: press only once both cards are on screen
  await waitFor(() => expect(hook?.cards).toHaveLength(2))
  act(() => {
    hook?.pay(a)
  })
  // Something else refetches the balances while the payment is on its way, without cancelling
  act(() => {
    void client.refetchQueries({ queryKey: settlementKeys.balances(7) }, { cancelRefetch: false })
  })
  const early = gets()[1]
  await answer(requests('POST')[0], 201, settlement(30, a))
  // That earlier request answers only now, still listing the paid transfer
  await answer(early, 200, { balances: [], suggested: [a, b] })
  await waitFor(() => expect(hook?.cards.map((card) => card.state)).toEqual(['paid', 'open']))
  expect(hook?.outstanding).toEqual([b])

  // A request started after the payment is the first to count; c makes its arrival visible
  const late = gets().at(-1) as Pending
  expect(late).not.toBe(early)
  await answer(late, 200, { balances: [], suggested: [b, c] })
  await waitFor(() => expect(hook?.outstanding).toEqual([b, c]))
  expect(hook?.cards.map((card) => [card.transfer, card.state])).toEqual([
    [a, 'paid'],
    [b, 'open'],
    [c, 'open'],
  ])
})
