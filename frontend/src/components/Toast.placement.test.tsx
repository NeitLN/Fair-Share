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

function layout(barTop: number, toastHeight: number, barHeight = 740 - barTop) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('form-actions')) return new DOMRect(0, barTop, 360, barHeight)
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

// Review of #295: once the form is scrolled up, its bar moves with the page; a toast whose usual place at
// the bottom does not reach the bar stays there, in sight, and counts down as usual
test.each([20, 300])('the bar scrolled up to %i px: the toast keeps its usual place and goes on time', (barTop) => {
  layout(barTop, 52, 64)
  render(
    <ToastProvider>
      <Page barTop={barTop} />
    </ToastProvider>,
  )
  fireEvent.click(screen.getByText('show'))
  const region = screen.getByRole('status')
  expect(region.style.top).toBe('')
  expect(region.style.visibility).toBe('')
  act(() => vi.advanceTimersByTime(TOAST_MS))
  expect(region).toBeEmptyDOMElement()
})
