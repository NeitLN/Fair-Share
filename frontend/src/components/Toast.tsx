import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { MAX_TOASTS, TOAST_MS, ToastContext } from '../lib/toast'
import type { ToastInput } from '../lib/toast'

interface Toast extends ToastInput {
  id: number
}

/** The toasts on screen, and those that left whose owner has not been told yet (DESIGN.md §5). */
interface Toasts {
  shown: Toast[]
  left: Toast[]
}

// `told`: the departures whose owners had been told when the change was asked for. They are dropped
// here, in the next change, so nothing is dropped before its owner hears it.
const leave = (state: Toasts, shown: Toast[], gone: Toast[], told: Set<number>): Toasts => ({
  shown,
  left: [...state.left.filter((toast) => !told.has(toast.id)), ...gone.filter((toast) => toast.onGone)],
})

function adding(state: Toasts, toast: Toast, told: Set<number>): Toasts {
  const next = [...state.shown, toast]
  // The oldest are pushed out, possibly before they were ever on screen
  return leave(state, next.slice(-MAX_TOASTS), next.slice(0, Math.max(0, next.length - MAX_TOASTS)), told)
}

function removing(state: Toasts, id: number, told: Set<number>): Toasts {
  const gone = state.shown.filter((toast) => toast.id === id)
  return gone.length === 0 ? state : leave(state, state.shown.filter((toast) => toast.id !== id), gone, told)
}

/** Toasts at the bottom of the screen (DESIGN.md §5); show one with useToast() from lib/toast. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Toasts>({ shown: [], left: [] })
  const toasts = state.shown
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  // Owners already told: a departure is in `left` for a while, its owner hears it once
  const told = useRef(new Set<number>())

  // Pure updates only: what changes on screen and who left are decided together, and acted on below
  // once React has committed them
  const dismiss = useCallback((id: number) => {
    const done = new Set(told.current)
    setState((current) => removing(current, id, done))
  }, [])

  const show = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++
      const done = new Set(told.current)
      setState((current) => adding(current, { ...input, id }, done))
      return () => dismiss(id)
    },
    [dismiss],
  )

  // One timer per toast on screen: start the missing ones, cancel those whose toast is gone. Running
  // after every change also restores the timers after StrictMode's unmount/remount in development.
  useEffect(() => {
    const running = timers.current
    for (const toast of toasts) {
      if (!running.has(toast.id)) running.set(toast.id, setTimeout(() => dismiss(toast.id), TOAST_MS))
    }
    for (const [id, timer] of running) {
      if (!toasts.some((toast) => toast.id === id)) {
        clearTimeout(timer)
        running.delete(id)
      }
    }
  }, [toasts, dismiss])

  // However a toast left (timed out, pushed out, acted on, dismissed), its owner hears it once, from
  // the committed state. It stays in `left` until the next change drops it, so none is lost untold.
  useEffect(() => {
    for (const toast of state.left) {
      if (told.current.has(toast.id)) continue
      told.current.add(toast.id)
      toast.onGone?.()
    }
    // Ids no longer in `left` can never come back
    for (const id of told.current) if (!state.left.some((toast) => toast.id === id)) told.current.delete(id)
  }, [state.left])

  // Leaving the app: no timer may fire into an unmounted provider
  useEffect(() => {
    const running = timers.current
    return () => {
      running.forEach(clearTimeout)
      running.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <span>{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                className="btn-ghost toast-action"
                onClick={() => {
                  dismiss(toast.id)
                  toast.action?.onAction()
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
