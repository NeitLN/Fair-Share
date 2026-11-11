import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { TOAST_MS, useToast } from '../lib/toast'
import { ToastProvider } from './Toast'

// specs/018-safe-saves, FR-014: below 1024 px a toast sits just above the sticky save bar, measured,
// and waits out of sight (its time stopped) when there is no room above it

function Page({ barTop }: { barTop: number }) {
  const show = useToast()
  return (
    <>
      <button type="button" onClick={() => show({ text: 'Đã lưu: Lẩu', action: { label: 'Xem', onAction: () => {} } })}>
        show
      </button>
      <div className="form-actions" data-top={barTop}>
        <button type="submit">Lưu khoản chi</button>
      </div>
    </>
  )
}

function layout(barTop: number, toastHeight: number) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('form-actions')) return new DOMRect(0, barTop, 360, 740 - barTop)
    if (this.classList.contains('toast-list')) return new DOMRect(0, 0, 328, toastHeight)
    return new DOMRect(0, 0, 0, 0)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} })),
  )
  vi.stubGlobal('innerHeight', 740)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

test('just above the save bar, whatever its height', () => {
  layout(620, 52)
  render(
    <ToastProvider>
      <Page barTop={620} />
    </ToastProvider>,
  )
  fireEvent.click(screen.getByText('show'))
  const region = screen.getByRole('status')
  // 620 (top of the bar) − 8 − 52 (the toast) = 560
  expect(region.style.top).toBe('560px')
  expect(region.style.visibility).toBe('')
})

test('no room above the bar: out of sight, its time stopped, until there is room', () => {
  layout(40, 52)
  render(
    <ToastProvider>
      <Page barTop={40} />
    </ToastProvider>,
  )
  fireEvent.click(screen.getByText('show'))
  const region = screen.getByRole('status', { hidden: true })
  expect(region.style.visibility).toBe('hidden')
  act(() => vi.advanceTimersByTime(TOAST_MS * 3))
  expect(region).toHaveTextContent('Đã lưu: Lẩu')
})
