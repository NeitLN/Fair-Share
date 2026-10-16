import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import HouseholdCreateForm from './HouseholdCreateForm'

describe('HouseholdCreateForm', () => {
  test('renders a labelled input and a submit button', () => {
    render(<HouseholdCreateForm onCreate={vi.fn()} submitting={false} error={null} />)
    expect(screen.getByLabelText('Tên nhà')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo nhà' })).toBeInTheDocument()
  })
})
