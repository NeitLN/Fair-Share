import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import HouseholdList from './HouseholdList'

describe('HouseholdList', () => {
  test('renders every household name', () => {
    render(
      <HouseholdList
        households={[
          { id: 1, name: 'Nhà trọ 123', created_at: '2026-10-01T00:00:00Z' },
          { id: 2, name: 'Chung cư 456', created_at: '2026-10-02T00:00:00Z' },
        ]}
        loading={false}
        error={null}
      />,
    )
    expect(screen.getByText('Nhà trọ 123')).toBeInTheDocument()
    expect(screen.getByText('Chung cư 456')).toBeInTheDocument()
  })
})
