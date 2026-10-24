import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'

import { memberLooks } from '../lib/names'
import MonthTotals from './MonthTotals'

const members = [
  { id: 1, household_id: 7, name: 'Tiến', created_at: '' },
  { id: 2, household_id: 7, name: 'Minh', created_at: '' },
]
const totals = {
  total: 550_000,
  members: [
    { memberId: 1, paid: 450_000, share: 225_000 },
    { memberId: 2, paid: 100_000, share: 325_000 },
    { memberId: 9, paid: 0, share: 0 },
  ],
}

test('the month total, then each member: paid and share', () => {
  render(<MonthTotals month="2026-10" totals={totals} looks={memberLooks(members)} me={2} highlight={1} />)

  expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Tháng 10/2026: cả nhà chi 550.000đ')
  const rows = within(screen.getByRole('list', { name: 'Từng người trong tháng 10/2026' })).getAllByRole('listitem')
  expect(rows).toHaveLength(3)
  expect(rows[0]).toHaveTextContent('Tiếnđã trả 450.000đ225.000đphần chia')
  expect(rows[0]).toHaveClass('highlighted')
  // You are marked; someone who left is still shown, by the usual name
  expect(within(rows[1]).getByText('bạn')).toBeInTheDocument()
  expect(rows[2]).toHaveTextContent('Thành viên đã xoá')
})
