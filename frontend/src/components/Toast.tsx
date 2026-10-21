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

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_MS),
      )
      setToasts((current) => {
        const next = [...current, { ...input, id }]
        // Over the limit: drop the oldest and its timer
        for (const old of next.slice(0, Math.max(0, next.length - MAX_TOASTS))) {
          clearTimeout(timers.current.get(old.id))
          timers.current.delete(old.id)
        }
        return next.slice(-MAX_TOASTS)
      })
    },
    [dismiss],
  )

  // Leaving the app: no timer may fire into an unmounted provider
  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
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
