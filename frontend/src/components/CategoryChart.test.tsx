import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'

import { categoryTotals } from '../lib/categories'
import type { Category, Expense } from '../api/types'
import CategoryChart from './CategoryChart'

const expense = (id: number, amount: number, category: Category) =>
  ({ id, amount, category, spent_at: '2026-11-03', shares: [] }) as unknown as Expense

function Landing() {
  const location = useLocation()
  return <p data-testid="landed">{`${location.pathname} ${JSON.stringify(location.state)}`}</p>
}

function renderChart(expenses: Expense[]) {
  return render(
    <MemoryRouter initialEntries={['/households/7/report/2026-11']}>
      <Routes>
        <Route
          path="/households/7/report/:month"
          element={<CategoryChart totals={categoryTotals(expenses)} month="2026-11" householdId={7} />}
        />
        <Route path="/households/7/expenses" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  )
}

test('largest first, every value written out, the bars hidden from screen readers', () => {
  renderChart([expense(1, 4_500_000, 'rent'), expense(2, 360_000, 'groceries'), expense(3, 1_000, 'household')])

  expect(screen.getByRole('heading', { level: 3, name: 'Chi theo danh mục' })).toBeInTheDocument()
  const links = within(screen.getByRole('list')).getAllByRole('link')
  expect(links.map((l) => l.getAttribute('aria-label'))).toEqual([
    'Tiền nhà: 4.500.000đ, 93% cả tháng',
    'Đi chợ: 360.000đ, 7% cả tháng',
    // Under 1% of the month: still listed, as "<1%"
    'Sinh hoạt: 1.000đ, <1% cả tháng',
  ])
  expect(links[0]).toHaveTextContent('Tiền nhà4.500.000đ · 93%')
  for (const link of links) {
    expect(link.querySelector('.category-track')).toHaveAttribute('aria-hidden', 'true')
  }
  // Bars are against the largest category, which fills its track
  expect((links[0].querySelector('.category-bar') as HTMLElement).style.width).toBe('100%')
  expect((links[1].querySelector('.category-bar') as HTMLElement).style.width).toBe('8%')
})

test('a line opens Chi tiêu on that month and category', async () => {
  renderChart([expense(1, 240_000, 'food'), expense(2, 90_000, 'transport')])
  await userEvent.click(screen.getByRole('link', { name: /^Đi lại/ }))
  expect(screen.getByTestId('landed')).toHaveTextContent('/households/7/expenses {"month":"2026-11","category":"transport"}')
})

test('nothing spent, no chart', () => {
  renderChart([])
  expect(screen.queryByRole('heading')).not.toBeInTheDocument()
})
