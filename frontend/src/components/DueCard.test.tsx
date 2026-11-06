import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { expect, test } from 'vitest'

import type { RecurringItem } from '../api/types'
import { memberLooks } from '../lib/names'
import DueCard from './DueCard'

const looks = memberLooks([
  { id: 1, household_id: 7, name: 'Tiến', created_at: '' },
  { id: 2, household_id: 7, name: 'Minh', created_at: '' },
])
const item = (id: number, overrides: Partial<RecurringItem> = {}): RecurringItem => ({
  id, household_id: 7, description: `Khoản ${id}`, category: 'rent', payer_id: 2, member_ids: [1, 2],
  amount: 4_500_000, day: 1, created_by: 10, created_at: '', ...overrides,
})

function Landing() {
  const location = useLocation()
  return <p data-testid="landed">{`${location.pathname} ${JSON.stringify(location.state)}`}</p>
}

function renderCard(items: RecurringItem[]) {
  render(
    <MemoryRouter initialEntries={['/households/7']}>
      <Routes>
        <Route path="/households/7" element={<DueCard items={items} looks={looks} householdId={7} />} />
        <Route path="/households/7/expenses" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  )
}

test('nothing due, no card', () => {
  renderCard([])
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
})

test('each due item: what, how much or "nhập số tiền", who pays, which day', () => {
  renderCard([item(1, { description: 'Tiền nhà' }), item(2, { description: 'Tiền điện', amount: null, day: 5 })])
  const card = screen.getByRole('region', { name: 'Đến ngày ghi' })
  const rows = within(card).getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('Tiền nhà4.500.000đ · Minh trả · ngày 1')
  expect(rows[1]).toHaveTextContent('Tiền điệnnhập số tiền tháng này · Minh trả · ngày 5')
})

test('Ghi tháng này opens Chi tiêu with the item to record', async () => {
  renderCard([item(1, { description: 'Tiền nhà' })])
  await userEvent.click(screen.getByRole('link', { name: 'Ghi Tiền nhà tháng này' }))
  expect(screen.getByTestId('landed')).toHaveTextContent('/households/7/expenses {"recordItem":1}')
})

test('3 at first, then Xem tất cả shows the rest and moves the focus to the first new one', async () => {
  renderCard([1, 2, 3, 4, 5].map((id) => item(id)))
  expect(screen.getAllByRole('link', { name: /^Ghi .* tháng này$/ })).toHaveLength(3)
  await userEvent.click(screen.getByRole('button', { name: 'Xem tất cả (5)' }))
  const links = screen.getAllByRole('link', { name: /^Ghi .* tháng này$/ })
  expect(links).toHaveLength(5)
  expect(links[3]).toHaveFocus()
})
