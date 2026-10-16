import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, test } from 'vitest'

import App from './App'

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('routes', () => {
  test.each([
    ['/', 'Các nhà'],
    ['/households/7', 'Tổng quan'],
    ['/households/7/expenses', 'Chi tiêu'],
    ['/households/7/members', 'Thành viên'],
    ['/no-such-page', 'Không tìm thấy trang'],
  ])('%s shows "%s"', (path, heading) => {
    renderAt(path)
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  test('household tabs link inside that household', () => {
    renderAt('/households/7')
    expect(screen.getByRole('link', { name: 'Chi tiêu' })).toHaveAttribute(
      'href',
      '/households/7/expenses',
    )
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page')
  })

  test('the header always links home', () => {
    renderAt('/households/7/members')
    expect(screen.getByRole('link', { name: 'Fair-Share' })).toHaveAttribute('href', '/')
  })
})
