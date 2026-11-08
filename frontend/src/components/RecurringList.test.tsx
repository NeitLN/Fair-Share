import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import type { Expense, RecurringItem } from '../api/types'
import { memberLooks } from '../lib/names'
import RecurringList from './RecurringList'

afterEach(() => vi.unstubAllGlobals())

const looks = memberLooks([
  { id: 1, household_id: 7, name: 'Tiến', created_at: '' },
  { id: 2, household_id: 7, name: 'Minh', created_at: '' },
])
const item = (id: number, overrides: Partial<RecurringItem> = {}): RecurringItem => ({
  id, household_id: 7, description: `Khoản ${id}`, category: 'rent', payer_id: 2, member_ids: [1, 2],
  amount: 4_500_000, day: 1, created_by: 10, created_at: '', ...overrides,
})

function renderList(items: RecurringItem[], expenses: Expense[] = [], onStop = vi.fn()) {
  render(
    <RecurringList
      items={items}
      expenses={expenses}
      today="2026-11-10"
      looks={looks}
      canStop={(i) => i.created_by === 10}
      onStop={onStop}
      stoppingId={null}
    />,
  )
  return onStop
}

test('folded, with how many; each item, its day and this month', async () => {
  renderList(
    [item(1, { description: 'Tiền nhà' }), item(2, { description: 'Tiền điện', amount: null, day: 5 }), item(3, { day: 20 })],
    [{ id: 9, spent_at: '2026-11-01', recurring_item_id: 1 } as Expense],
  )
  const summary = screen.getByText('Khoản định kỳ (3)')
  await userEvent.click(summary)
  const rows = within(summary.closest('details') as HTMLElement).getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('Tiền nhà4.500.000đ · Minh trả · ngày 1tháng này đã ghi')
  expect(rows[1]).toHaveTextContent('Tiền điệnsố tiền thay đổi · Minh trả · ngày 5đến ngày ghi')
  expect(rows[2]).toHaveTextContent('chưa tới ngày')
})

test('Ngừng lặp only where allowed, and only after a yes', async () => {
  const confirm = vi.fn(() => false)
  vi.stubGlobal('confirm', confirm)
  const onStop = renderList([item(1, { description: 'Internet' }), item(2, { created_by: 11 })])
  await userEvent.click(screen.getByText('Khoản định kỳ (2)'))
  expect(screen.getAllByRole('button', { name: /^Ngừng lặp/ })).toHaveLength(1)
  const stop = screen.getByRole('button', { name: 'Ngừng lặp Internet' })
  await userEvent.click(stop)
  expect(confirm).toHaveBeenCalledWith(
    'Ngừng lặp Internet? Các khoản đã ghi vẫn giữ nguyên, chỉ không hiện trên Tổng quan nữa.',
  )
  expect(onStop).not.toHaveBeenCalled()
  confirm.mockReturnValue(true)
  await userEvent.click(stop)
  expect(onStop).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
})

test('empty: how to make one', async () => {
  renderList([])
  await userEvent.click(screen.getByText('Khoản định kỳ (0)'))
  expect(screen.getByText('Chưa có khoản định kỳ. Tích Lặp lại hằng tháng khi ghi khoản chi.')).toBeInTheDocument()
})
