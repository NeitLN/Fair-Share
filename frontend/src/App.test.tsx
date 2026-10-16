import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { mockApi, renderApp } from './test/renderApp'

beforeEach(() => {
  mockApi({
    'GET /api/households': [200, []],
    'GET /api/households/7': [200, { id: 7, name: 'Nhà 7', created_at: '2026-10-16T00:00:00Z' }],
    'GET /api/households/7/members': [200, []],
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('routes', () => {
  test.each([
    ['/', 'Các nhà'],
    ['/households/7', 'Tổng quan'],
    ['/households/7/expenses', 'Chi tiêu'],
    ['/households/7/members', 'Thành viên'],
    ['/no-such-page', 'Không tìm thấy trang'],
  ])('%s shows "%s"', async (path, heading) => {
    renderApp(path)
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  test('household tabs link inside that household', async () => {
    renderApp('/households/7')
    expect(await screen.findByRole('link', { name: 'Chi tiêu' })).toHaveAttribute(
      'href',
      '/households/7/expenses',
    )
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page')
  })

  test('the header always links home', async () => {
    renderApp('/households/7/members')
    expect(await screen.findByRole('link', { name: 'Fair-Share' })).toHaveAttribute('href', '/')
  })
})
