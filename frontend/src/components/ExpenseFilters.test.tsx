import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { NO_FILTER } from '../lib/expenseFilters'
import ExpenseFilters from './ExpenseFilters'

const members = [
  { id: 1, household_id: 7, name: 'Tiến', created_at: '' },
  { id: 2, household_id: 7, name: 'Minh', created_at: '' },
]

test('a labelled month and member, "Tất cả" and "Cả nhà" first', () => {
  render(<ExpenseFilters months={['2026-10', '2026-09']} members={members} filter={NO_FILTER} onChange={() => {}} />)
  const month = screen.getByLabelText('Tháng')
  expect([...month.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
    'Tất cả',
    '10/2026',
    '9/2026',
  ])
  const member = screen.getByLabelText('Người')
  expect([...member.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Cả nhà', 'Tiến', 'Minh'])
  expect(screen.getByRole('group', { name: 'Lọc khoản chi' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Bỏ lọc' })).not.toBeInTheDocument()
})

test('each choice keeps the other one; Bỏ lọc clears both', async () => {
  const onChange = vi.fn()
  const user = userEvent.setup()
  render(
    <ExpenseFilters
      months={['2026-10']}
      members={members}
      filter={{ month: '2026-10', memberId: null }}
      onChange={onChange}
    />,
  )

  await user.selectOptions(screen.getByLabelText('Người'), 'Minh')
  expect(onChange).toHaveBeenLastCalledWith({ month: '2026-10', memberId: 2 })

  await user.selectOptions(screen.getByLabelText('Tháng'), 'Tất cả')
  expect(onChange).toHaveBeenLastCalledWith({ month: null, memberId: null })

  await user.click(screen.getByRole('button', { name: 'Bỏ lọc' }))
  expect(onChange).toHaveBeenLastCalledWith(NO_FILTER)
})
