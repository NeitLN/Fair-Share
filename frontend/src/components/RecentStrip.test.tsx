import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { expect, test, vi } from 'vitest'

import { setLanguage } from '../i18n'
import { memberLooks } from '../lib/names'
import type { RecentItem } from '../lib/recent'
import RecentStrip from './RecentStrip'

const members = [
  { id: 1, household_id: 7, name: 'Tiến', created_at: '' },
  { id: 2, household_id: 7, name: 'Minh', created_at: '' },
  { id: 3, household_id: 7, name: 'Duy Anh', created_at: '' },
]
const looks = memberLooks(members)
const at = (hour: number) => new Date(2026, 10, 6, hour, 5).toISOString()
const expenseItem = (id: number, hour: number, by: number | null = 2): RecentItem => ({
  kind: 'expense', id, savedKey: '', savedAt: at(hour), recorderMemberId: by, amount: 240_000, description: `Lẩu ${id}`,
})
const repaymentItem = (id: number, hour: number, from = 1): RecentItem => ({
  kind: 'repayment', id, savedKey: '', savedAt: at(hour), recorderMemberId: 2, amount: 440_000, fromMemberId: from,
})

function Landing() {
  const location = useLocation()
  return <p data-testid="landed">{`${location.pathname} ${JSON.stringify(location.state)}`}</p>
}

function renderStrip(items: RecentItem[], { initialCount = 3, onSeen = vi.fn() } = {}) {
  render(
    <MemoryRouter initialEntries={['/households/7']}>
      <Routes>
        <Route
          path="/households/7"
          element={<RecentStrip items={items} looks={looks} me={1} householdId={7} initialCount={initialCount} onSeen={onSeen} />}
        />
        <Route path="/households/7/expenses" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  )
  return onSeen
}

const lines = () => within(screen.getByRole('list')).getAllByRole('link')

test('nothing new, nothing shown', () => {
  renderStrip([])
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
})

test('who recorded what and how much, "bạn" when you paid, and when', () => {
  renderStrip([repaymentItem(9, 14), expenseItem(5, 9), expenseItem(6, 8, null)])
  const strip = screen.getByRole('region', { name: 'Mới ghi' })
  expect(strip).toHaveAttribute('aria-live', 'polite')
  expect(lines().map((l) => l.querySelector('.recent-text')?.textContent)).toEqual([
    'Minh ghi đã nhận 440.000đ từ bạn',
    'Minh ghi Lẩu 5 · 240.000đ',
    // A recorder whose account left the house
    'Thành viên đã xoá ghi Lẩu 6 · 240.000đ',
  ])
  expect(lines()[0]).toHaveTextContent(/14:05$/)
})

test('a repayment from someone else names them', () => {
  renderStrip([repaymentItem(9, 14, 3)])
  expect(lines()[0]).toHaveTextContent('Minh ghi đã nhận 440.000đ từ Duy Anh')
})

test('3 at first, then Xem thêm shows the rest in place', async () => {
  renderStrip([1, 2, 3, 4, 5].map((id) => expenseItem(id, 20 - id)))
  expect(lines()).toHaveLength(3)
  const more = screen.getByRole('button', { name: 'Xem thêm 2' })
  expect(more).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(more)
  expect(lines()).toHaveLength(5)
  expect(screen.queryByRole('button', { name: /^Xem thêm/ })).not.toBeInTheDocument()
  // The button is gone, so the focus moves to the first line it revealed, not to the page (review of #201)
  expect(lines()[3]).toHaveFocus()
})

test('from the keyboard too, Xem thêm lands on the first new line', async () => {
  renderStrip([1, 2, 3, 4].map((id) => expenseItem(id, 20 - id)))
  screen.getByRole('button', { name: 'Xem thêm 1' }).focus()
  await userEvent.keyboard('{Enter}')
  expect(lines()[3]).toHaveFocus()
  expect(lines()[3]).toHaveTextContent('Lẩu 4')
})

test('an expense opens in Chi tiêu, revealed; a repayment goes to its row in Lịch sử trả', async () => {
  renderStrip([repaymentItem(9, 14), expenseItem(5, 9)])
  expect(lines()[0]).toHaveAttribute('href', '#settlement-9')
  await userEvent.click(lines()[1])
  expect(screen.getByTestId('landed')).toHaveTextContent('/households/7/expenses {"revealExpense":5}')
})

test('Đã xem tất cả names how many it covers, folded ones included', async () => {
  const onSeen = renderStrip([1, 2, 3, 4].map((id) => expenseItem(id, 20 - id)))
  await userEvent.click(screen.getByRole('button', { name: 'Đã xem tất cả 4 mục mới' }))
  expect(onSeen).toHaveBeenCalledTimes(1)
})

test('in English', () => {
  setLanguage('en')
  renderStrip([repaymentItem(9, 14), expenseItem(5, 9)])
  expect(screen.getByRole('region', { name: 'Recently added' })).toBeInTheDocument()
  expect(lines()[0]).toHaveTextContent('Minh recorded receiving 440,000 ₫ from you')
  expect(lines()[1]).toHaveTextContent('Minh added Lẩu 5 · 240,000 ₫')
  expect(screen.getByRole('button', { name: 'Mark all 2 new items as seen' })).toHaveTextContent('Mark all as seen')
})
