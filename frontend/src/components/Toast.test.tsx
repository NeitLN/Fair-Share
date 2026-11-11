import { StrictMode, useEffect } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { MAX_TOASTS, TOAST_MS, useSaveFeedback, useToast } from '../lib/toast'
import type { SaveFeedback, ToastInput } from '../lib/toast'
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

// specs/018-safe-saves, User Story 3: toasts never cover the save, never say "saved" next to an error,
// and stay while someone is using them
describe('Toast and saves', () => {
  function phoneWidth(phone: boolean) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('599.98') ? phone : query.includes('1023.98'),
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    )
  }
  afterEach(() => vi.unstubAllGlobals())

  function Saves({ feedbackRef }: { feedbackRef: { current: SaveFeedback | null } }) {
    feedbackRef.current = useSaveFeedback()
    return null
  }
  const setup = (toasts: ToastInput[]) => {
    const feedback: { current: SaveFeedback | null } = { current: null }
    render(
      <ToastProvider>
        <Trigger toasts={toasts} />
        <Saves feedbackRef={feedback} />
      </ToastProvider>,
    )
    return feedback
  }
  const status = () => screen.getByRole('status')
  const shown = () => document.querySelectorAll('.toast').length

  test('a toast in use is not counted down; leaving it starts the full 7 s again', () => {
    setup([{ text: 'Đã ghi', action: { label: 'Hoàn tác', onAction: () => {} } }])
    fireEvent.click(screen.getByText('show 0'))
    const toast = document.querySelector('.toast') as HTMLElement
    act(() => vi.advanceTimersByTime(5_000))
    fireEvent.focus(screen.getByRole('button', { name: 'Hoàn tác' }))
    act(() => vi.advanceTimersByTime(15_000))
    expect(status()).toHaveTextContent('Đã ghi')
    fireEvent.blur(screen.getByRole('button', { name: 'Hoàn tác' }))
    act(() => vi.advanceTimersByTime(TOAST_MS - 1))
    expect(status()).toHaveTextContent('Đã ghi')
    act(() => vi.advanceTimersByTime(1))
    expect(toast).not.toBeInTheDocument()
  })

  test('focus and pointer are told apart: tabbing out under the pointer keeps it in use', () => {
    setup([{ text: 'Đã ghi', action: { label: 'Hoàn tác', onAction: () => {} } }])
    fireEvent.click(screen.getByText('show 0'))
    const toast = document.querySelector('.toast') as HTMLElement
    fireEvent.pointerEnter(toast)
    fireEvent.focus(screen.getByRole('button', { name: 'Hoàn tác' }))
    fireEvent.blur(screen.getByRole('button', { name: 'Hoàn tác' }))
    act(() => vi.advanceTimersByTime(TOAST_MS * 2))
    expect(status()).toHaveTextContent('Đã ghi')
    fireEvent.pointerLeave(toast)
    act(() => vi.advanceTimersByTime(TOAST_MS))
    expect(toast).not.toBeInTheDocument()
  })

  test('a sticky toast never times out and can be closed', () => {
    const gone = vi.fn()
    setup([{ text: 'Chưa nhận được kết quả.', sticky: true, onGone: gone }])
    fireEvent.click(screen.getByText('show 0'))
    act(() => vi.advanceTimersByTime(60_000))
    expect(status()).toHaveTextContent('Chưa nhận được kết quả.')
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(status()).toBeEmptyDOMElement()
    expect(gone).toHaveBeenCalledOnce()
  })

  test('on a phone one shows at a time: a new one replaces one nobody uses, and waits behind one in use', () => {
    phoneWidth(true)
    const gone = [vi.fn(), vi.fn(), vi.fn(), vi.fn()]
    setup(['một', 'hai', 'ba', 'bốn'].map((text, i) => ({ text, onGone: gone[i], action: { label: `nút ${i}`, onAction: () => {} } })))
    fireEvent.click(screen.getByText('show 0'))
    fireEvent.click(screen.getByText('show 1'))
    expect(shown()).toBe(1)
    expect(status()).toHaveTextContent('hai')
    expect(gone[0]).toHaveBeenCalledOnce()

    fireEvent.focus(screen.getByRole('button', { name: 'nút 1' }))
    fireEvent.click(screen.getByText('show 2'))
    fireEvent.click(screen.getByText('show 3'))
    expect(status()).toHaveTextContent('hai')
    expect(gone[2]).toHaveBeenCalledOnce() // skipped while waiting: the newest wins
    fireEvent.blur(screen.getByRole('button', { name: 'nút 1' }))
    expect(status()).toHaveTextContent('bốn')
    expect(shown()).toBe(1)
    expect(gone[1]).toHaveBeenCalledOnce()
    expect(gone[3]).not.toHaveBeenCalled()
  })

  test('from 600 px up to three stack, and one in use is never pushed out', () => {
    phoneWidth(false)
    setup(['một', 'hai', 'ba', 'bốn'].map((text, i) => ({ text, action: { label: `nút ${i}`, onAction: () => {} } })))
    fireEvent.click(screen.getByText('show 0'))
    fireEvent.focus(screen.getByRole('button', { name: 'nút 0' }))
    for (let i = 1; i < 4; i++) fireEvent.click(screen.getByText(`show ${i}`))
    expect(status()).toHaveTextContent('một')
    expect(status()).not.toHaveTextContent('hai')
    expect(shown()).toBe(3)
  })

  test('a new save takes away its own "saved" toast, unless someone is using it', () => {
    const feedback = setup([
      { text: 'Đã lưu: Lẩu', kind: 'success', source: 'expense-form' },
      { text: 'Đã báo Tiến.', kind: 'success', source: 'transfer-2-1' },
    ])
    fireEvent.click(screen.getByText('show 0'))
    fireEvent.click(screen.getByText('show 1'))
    act(() => feedback.current?.started('expense-form'))
    expect(status()).not.toHaveTextContent('Đã lưu: Lẩu')
    expect(status()).toHaveTextContent('Đã báo Tiến.')
  })

  test('a save error takes every "saved" toast away, even in use, moves the focus, and keeps new ones off', () => {
    const target = document.createElement('button')
    document.body.append(target)
    const feedback = setup([
      { text: 'Đã lưu: Lẩu', kind: 'success', source: 'expense-form', action: { label: 'Xem', onAction: () => {} } },
      { text: 'Đã lưu: Gas', kind: 'success', source: 'expense-form' },
      { text: 'Đã hoàn tác.' },
    ])
    fireEvent.click(screen.getByText('show 0'))
    const xem = screen.getByRole('button', { name: 'Xem' })
    xem.focus()
    fireEvent.focus(xem)
    let end: () => void = () => {}
    act(() => {
      end = feedback.current?.errorShown(() => target) ?? (() => {})
    })
    act(() => vi.advanceTimersByTime(0))
    expect(status()).toBeEmptyDOMElement()
    expect(target).toHaveFocus()

    fireEvent.click(screen.getByText('show 1'))
    fireEvent.click(screen.getByText('show 2'))
    expect(status()).not.toHaveTextContent('Đã lưu: Gas')
    expect(status()).toHaveTextContent('Đã hoàn tác.')

    act(() => end())
    fireEvent.click(screen.getByText('show 1'))
    expect(status()).toHaveTextContent('Đã lưu: Gas')
    target.remove()
  })
})
