import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'

import type { MyHousehold } from '../api/types'
import HouseholdList from './HouseholdList'

const mine: MyHousehold[] = [
  { id: 7, name: 'Nhà 7', created_at: '', role: 'owner', member_id: 1 },
  { id: 9, name: 'Nhà 9', created_at: '', role: 'member', member_id: 5 },
]

function show(households: MyHousehold[]) {
  render(
    <MemoryRouter>
      <HouseholdList households={households} />
    </MemoryRouter>,
  )
}

test('each household is one link, the ones you own marked', () => {
  show(mine)
  const links = screen.getAllByRole('link')
  expect(links.map((link) => link.getAttribute('href'))).toEqual(['/households/7', '/households/9'])
  expect(within(links[0]).getByText('Trưởng nhóm')).toBeInTheDocument()
  expect(within(links[1]).queryByText('Trưởng nhóm')).not.toBeInTheDocument()
})

test('each card says what you get, owe or have settled there, in its colour', () => {
  show([
    { ...mine[0], my_net: 5_633_500 },
    { ...mine[1], my_net: -120_000 },
    { id: 10, name: 'Nhà 10', created_at: '', role: 'member', member_id: 6, my_net: 0 },
  ])

  const balances = document.querySelectorAll('.household-balance')
  expect(balances[0]).toHaveTextContent('Bạn được nhận 5.633.500đ')
  expect(balances[0]).toHaveClass('credit-text')
  expect(balances[1]).toHaveTextContent('Bạn cần trả 120.000đ')
  expect(balances[1]).toHaveClass('debt-text')
  expect(balances[2]).toHaveTextContent('Đã xong')
})

test('a card with things waiting shows the number with its accessible name', () => {
  show([{ ...mine[0], waiting: 2 }])

  const badge = screen.getByRole('status', { name: '2 việc đang chờ bạn' })
  expect(badge).toHaveTextContent('2')
})

test('without the figures a card is still the name and still opens the house', () => {
  show([{ id: 11, name: 'Nhà 11', created_at: '', role: 'member', member_id: 9 }])

  const link = screen.getByRole('link')
  expect(link).toHaveAttribute('href', '/households/11')
  expect(link).toHaveTextContent('Nhà 11')
  expect(link.querySelector('.household-balance')).toBeNull()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('with none, it says how to get one', () => {
  show([])
  expect(screen.getByText(/Bạn chưa ở nhà nào/)).toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
})
