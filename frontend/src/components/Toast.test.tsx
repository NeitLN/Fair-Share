import { StrictMode, useEffect } from 'react'
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

  test('a toast shown while mounting under StrictMode still goes away (dev double effects)', () => {
    function ShowOnMount() {
      const show = useToast()
      useEffect(() => show({ text: 'Đã ghi' }), [show])
      return null
    }
    render(
      <StrictMode>
        <ToastProvider>
          <ShowOnMount />
        </ToastProvider>
      </StrictMode>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Đã ghi')
    act(() => vi.advanceTimersByTime(TOAST_MS))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
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

  describe('onGone tells the owner once, whichever way the toast leaves', () => {
    test('not before a toast shown from a mounting child is even on screen; once on timeout', () => {
      const gone = vi.fn()
      function ShowOnMount() {
        const show = useToast()
        useEffect(() => {
          show({ text: 'Đã ghi', onGone: gone })
        }, [show])
        return null
      }
      render(
        <ToastProvider>
          <ShowOnMount />
        </ToastProvider>,
      )
      expect(screen.getByRole('status')).toHaveTextContent('Đã ghi')
      expect(gone).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(TOAST_MS))
      expect(gone).toHaveBeenCalledTimes(1)
    })

    test('under StrictMode, where React runs each state update twice, the owner still hears it once', () => {
      const gone = vi.fn()
      render(
        <StrictMode>
          <ToastProvider>
            <Trigger toasts={[{ text: 'một', onGone: gone }, { text: 'hai' }, { text: 'ba' }, { text: 'bốn' }]} />
          </ToastProvider>
        </StrictMode>,
      )
      for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText(`show ${i}`))
      expect(screen.getByRole('status')).not.toHaveTextContent('một')
      expect(gone).toHaveBeenCalledTimes(1)
      act(() => vi.advanceTimersByTime(TOAST_MS))
      expect(gone).toHaveBeenCalledTimes(1)
    })

    test('however many leave in one batch, every owner is told once', () => {
      const owners = Array.from({ length: MAX_TOASTS + 21 }, () => vi.fn())
      function ShowMany() {
        const show = useToast()
        useEffect(() => {
          owners.forEach((onGone, i) => show({ text: 'toast ' + i, onGone }))
        }, [show])
        return null
      }
      render(
        <ToastProvider>
          <ShowMany />
        </ToastProvider>,
      )
      // All but the last MAX_TOASTS were pushed out
      owners.slice(0, -MAX_TOASTS).forEach((onGone) => expect(onGone).toHaveBeenCalledTimes(1))
      owners.slice(-MAX_TOASTS).forEach((onGone) => expect(onGone).not.toHaveBeenCalled())
      act(() => vi.advanceTimersByTime(TOAST_MS))
      owners.forEach((onGone) => expect(onGone).toHaveBeenCalledTimes(1))
    })

    test('pushed out in the same batch, before its timer started', () => {
      const gone = vi.fn()
      function ShowMany() {
        const show = useToast()
        useEffect(() => {
          show({ text: 'một', onGone: gone })
          for (const text of ['hai', 'ba', 'bốn']) show({ text })
        }, [show])
        return null
      }
      render(
        <ToastProvider>
          <ShowMany />
        </ToastProvider>,
      )
      expect(screen.getByRole('status')).not.toHaveTextContent('một')
      expect(gone).toHaveBeenCalledTimes(1)
    })

    test('acted on, and dismissed by its owner', () => {
      const actedGone = vi.fn()
      const dismissedGone = vi.fn()
      let dismiss: () => void = () => {}
      function Owner() {
        const show = useToast()
        return (
          <button
            type="button"
            onClick={() => {
              show({ text: 'Đã ghi', action: { label: 'Hoàn tác', onAction: vi.fn() }, onGone: actedGone })
              dismiss = show({ text: 'Đã sao chép', onGone: dismissedGone })
            }}
          >
            show
          </button>
        )
      }
      render(
        <ToastProvider>
          <Owner />
        </ToastProvider>,
      )
      fireEvent.click(screen.getByText('show'))
      fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }))
      act(() => dismiss())
      act(() => dismiss())
      expect(actedGone).toHaveBeenCalledTimes(1)
      expect(dismissedGone).toHaveBeenCalledTimes(1)
      act(() => vi.advanceTimersByTime(TOAST_MS))
      expect(actedGone).toHaveBeenCalledTimes(1)
      expect(dismissedGone).toHaveBeenCalledTimes(1)
    })
  })
})
