import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { MAX_TOASTS, TOAST_MS, ToastContext } from '../lib/toast'
import type { ToastInput } from '../lib/toast'

interface Toast extends ToastInput {
  id: number
}

/** Toasts at the bottom of the screen (DESIGN.md §5); show one with useToast() from lib/toast. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  // Toasts that have just left the list and whose owner wants to hear it, by id. Filled where the list
  // changes (by id, so a repeated updater in StrictMode records the same entry) and emptied after it.
  const left = useRef(new Map<number, () => void>())
  const leaving = (gone: Toast[]) => {
    for (const toast of gone) if (toast.onGone) left.current.set(toast.id, toast.onGone)
  }

  const dismiss = useCallback((id: number) => {
    setToasts((current) => {
      leaving(current.filter((toast) => toast.id === id))
      return current.filter((toast) => toast.id !== id)
    })
  }, [])

  // Only the list changes here; the timers and the owners' callbacks follow it in the effect below
  const show = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++
      setToasts((current) => {
        const next = [...current, { ...input, id }]
        // The oldest are pushed out, possibly before they were ever on screen
        leaving(next.slice(0, Math.max(0, next.length - MAX_TOASTS)))
        return next.slice(-MAX_TOASTS)
      })
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
    // However a toast left (timed out, pushed out, acted on, dismissed), its owner hears it once
    for (const [id, gone] of left.current) {
      left.current.delete(id)
      gone()
    }
  }, [toasts, dismiss])

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
