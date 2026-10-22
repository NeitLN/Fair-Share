import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import Skeleton from './Skeleton'

describe('Skeleton', () => {
  test('is a busy status that names what is loading', () => {
    render(<Skeleton label="Đang tải danh sách khoản chi" />)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('Đang tải danh sách khoản chi')
  })

  test('draws 3 placeholder rows by default', () => {
    const { container } = render(<Skeleton label="Đang tải" />)
    expect(container.querySelectorAll('.skeleton-row')).toHaveLength(3)
  })

  test('draws the requested number of rows', () => {
    const { container } = render(<Skeleton rows={5} label="Đang tải" />)
    expect(container.querySelectorAll('.skeleton-row')).toHaveLength(5)
  })

  test('placeholder rows are hidden from screen readers', () => {
    const { container } = render(<Skeleton label="Đang tải" />)
    const rows = [...container.querySelectorAll('.skeleton-row')]
    expect(rows).toHaveLength(3)
    for (const row of rows) expect(row).toHaveAttribute('aria-hidden', 'true')
  })
})
