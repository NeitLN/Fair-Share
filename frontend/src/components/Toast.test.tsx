import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { MAX_TOASTS, TOAST_MS, useToast } from '../lib/toast'
import type { ToastInput } from '../lib/toast'
import { ToastProvider } from './Toast'

// A button per toast to show, so a test can fire them in order
function Trigger({ toasts }: { toasts: ToastInput[] }) {
  const show = useToast()
  return (
    <>
      {toasts.map((toast, i) => (
        <button key={i} type="button" onClick={() => show(toast)}>
          show {i}
        </button>
      ))}
    </>
  )
}

const renderWith = (toasts: ToastInput[]) =>
  render(
    <ToastProvider>
      <Trigger toasts={toasts} />
    </ToastProvider>,
  )

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('Toast', () => {
  test('a toast is announced politely and goes away after 7 s', () => {
    renderWith([{ text: 'Đã lưu: Lẩu · 240.000đ' }])
    fireEvent.click(screen.getByText('show 0'))
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu: Lẩu · 240.000đ')

    act(() => vi.advanceTimersByTime(TOAST_MS - 1))
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu')
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  test('the action runs once and closes its own toast only', () => {
    const undoFirst = vi.fn()
    const undoSecond = vi.fn()
    renderWith([
      { text: 'Đã ghi: Bạn trả Minh 120.000đ', action: { label: 'Hoàn tác', onAction: undoFirst } },
      { text: 'Đã ghi: Anh trả Minh 80.000đ', action: { label: 'Hoàn tác', onAction: undoSecond } },
    ])
    fireEvent.click(screen.getByText('show 0'))
    fireEvent.click(screen.getByText('show 1'))

    // Two payments, two Hoàn tác buttons, each tied to its own payment
    const [first] = screen.getAllByRole('button', { name: 'Hoàn tác' })
    fireEvent.click(first)
    expect(undoFirst).toHaveBeenCalledTimes(1)
    expect(undoSecond).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Anh trả Minh')
    expect(screen.getByRole('status')).not.toHaveTextContent('Bạn trả Minh')
  })

  test(`at most ${MAX_TOASTS} at once: the oldest goes first`, () => {
    renderWith(['một', 'hai', 'ba', 'bốn'].map((text) => ({ text })))
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText(`show ${i}`))
    const status = screen.getByRole('status')
    expect(status).not.toHaveTextContent('một')
    expect(status).toHaveTextContent('haibabốn')
  })

  test('leaving the page cancels pending timers', () => {
    const { unmount } = renderWith([{ text: 'x' }])
    fireEvent.click(screen.getByText('show 0'))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  test('useToast outside the provider is a programming error, said plainly', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger toasts={[]} />)).toThrow(/ToastProvider/)
  })
})
