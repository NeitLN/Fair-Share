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

test('with none, it says how to get one', () => {
  show([])
  expect(screen.getByText(/Bạn chưa ở nhà nào/)).toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
})
