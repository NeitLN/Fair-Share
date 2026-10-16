import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, test } from 'vitest'

import HouseholdList from './HouseholdList'

describe('HouseholdList', () => {
  test('links every household to its own page', () => {
    render(
      <MemoryRouter>
        <HouseholdList
          households={[
            { id: 1, name: 'Nhà trọ 123', created_at: '2026-10-01T00:00:00Z' },
            { id: 2, name: 'Chung cư 456', created_at: '2026-10-02T00:00:00Z' },
          ]}
          loading={false}
          error={null}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Nhà trọ 123' })).toHaveAttribute('href', '/households/1')
    expect(screen.getByRole('link', { name: 'Chung cư 456' })).toHaveAttribute('href', '/households/2')
  })

  test('says so when there is no household yet', () => {
    render(<HouseholdList households={[]} loading={false} error={null} />)
    expect(screen.getByText(/Chưa có nhà nào/)).toBeInTheDocument()
  })
})
