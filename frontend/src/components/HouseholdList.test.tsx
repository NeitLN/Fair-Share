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

test('each row says what you get, owe or have settled there: the words, then the amount in its colour', () => {
  show([
    { ...mine[0], my_net: 5_633_500 },
    { ...mine[1], my_net: -120_000 },
    { id: 10, name: 'Nhà 10', created_at: '', role: 'member', member_id: 6, my_net: 0 },
  ])

  // Rows in one panel, not a card each (specs/017, FR-001)
  expect(document.querySelector('ul.house-rows')?.children).toHaveLength(3)
  const money = document.querySelectorAll('.household-money')
  expect(money[0]).toHaveTextContent('Bạn được nhận 5.633.500đ')
  expect(money[0].querySelector('.household-amount')).toHaveClass('credit-text')
  expect(money[1]).toHaveTextContent('Bạn cần trả 120.000đ')
  expect(money[1].querySelector('.household-amount')).toHaveClass('debt-text')
  // The words never carry the colour alone: they stay quiet, the amount says which way
  expect(money[1].querySelector('.household-words')).not.toHaveClass('debt-text')
  expect(money[2]).toHaveTextContent('Đã xong')
  expect(money[2].querySelector('.household-amount')).toBeNull()
  // The row reads as one sentence to a screen reader
  expect(screen.getByRole('link', { name: /^Nhà 9.*Bạn cần trả 120\.000đ/ })).toBeInTheDocument()
})

test("each row has a sticker in the house's colour that screen readers skip", () => {
  show(mine)
  const tiles = document.querySelectorAll('.house-tile')
  expect(tiles).toHaveLength(2)
  expect(tiles[0]).toHaveClass('tint-8') // 7 % 8 + 1
  expect(tiles[1]).toHaveClass('tint-2') // 9 % 8 + 1
  tiles.forEach((tile) => expect(tile).toHaveAttribute('aria-hidden', 'true'))
})

test('a row with things waiting shows the number with its accessible name', () => {
  show([{ ...mine[0], waiting: 2 }])

  const badge = screen.getByRole('status', { name: '2 việc đang chờ bạn' })
  expect(badge).toHaveTextContent('2')
})

test('without the figures a row is still the name and still opens the house', () => {
  show([{ id: 11, name: 'Nhà 11', created_at: '', role: 'member', member_id: 9 }])

  const link = screen.getByRole('link')
  expect(link).toHaveAttribute('href', '/households/11')
  expect(link).toHaveTextContent('Nhà 11')
  expect(link.querySelector('.household-money')).toBeNull()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('with none, it says how to get one', () => {
  show([])
  expect(screen.getByText(/Bạn chưa ở nhà nào/)).toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
})

// Review 12/11, A13: nobody else in the house yet is not "done"
test('a house of one says Chỉ có bạn, not Đã xong', () => {
  show([
    { ...mine[0], my_net: 0, people: 1 },
    { ...mine[1], my_net: 0, people: 3 },
  ])
  const links = screen.getAllByRole('link')
  expect(links[0]).toHaveTextContent('Chỉ có bạn')
  expect(links[1]).toHaveTextContent('Đã xong')
})