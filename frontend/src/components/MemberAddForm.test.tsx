import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import MemberAddForm from './MemberAddForm'

describe('MemberAddForm', () => {
  test('renders a labelled input and a submit button', () => {
    render(<MemberAddForm onAdd={vi.fn()} submitting={false} error={null} />)
    expect(screen.getByLabelText('Tên thành viên')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thêm thành viên' })).toBeInTheDocument()
  })
})
