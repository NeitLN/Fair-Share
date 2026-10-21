import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('routes', () => {
  test.each([
    ['/', 'Nhà của bạn'],
    ['/no-such-page', 'Không tìm thấy trang'],
  ])('%s shows "%s"', async (path, heading) => {
    renderApp(path)
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  // Inside a household the house name is the one h1; each page names itself in an h2 for screen
  // readers (the tabs already show it on screen)
  test.each([
    ['/households/7', 'Tổng quan'],
    ['/households/7/expenses', 'Chi tiêu'],
    ['/households/7/members', 'Thành viên'],
  ])('%s is "%s" of Nhà 7, with one h1', async (path, page) => {
    renderApp(path)
    expect(await screen.findByRole('heading', { level: 2, name: page })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Nhà 7' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  test('household tabs link inside that household', async () => {
    renderApp('/households/7')
    expect(await screen.findByRole('link', { name: 'Chi tiêu' })).toHaveAttribute(
      'href',
      '/households/7/expenses',
    )
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page')
  })

  test('the theme switch forces light or dark and can go back to following the phone', async () => {
    renderApp('/')
    const dark = await screen.findByRole('button', { name: 'Tối' })
    await userEvent.click(dark)
    expect(dark).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    await userEvent.click(screen.getByRole('button', { name: 'Tự động' }))
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  test('the header always links home', async () => {
    renderApp('/households/7/members')
    expect(await screen.findByRole('link', { name: 'Fair-Share' })).toHaveAttribute('href', '/')
  })
})
