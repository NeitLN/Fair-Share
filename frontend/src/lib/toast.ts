import { createContext, useContext } from 'react'

export interface ToastAction {
  label: string
  onAction: () => void
}

export interface ToastInput {
  text: string
  /** One action, e.g. "Hoàn tác". It belongs to this toast only, even when others appear after it. */
  action?: ToastAction
}

/** How long a toast stays (DESIGN.md §5): long enough to reach "Hoàn tác" with one hand. */
export const TOAST_MS = 7000
/** At most this many at once; the oldest goes first. Each keeps its own action. */
export const MAX_TOASTS = 3

export const ToastContext = createContext<((toast: ToastInput) => void) | null>(null)

/** Show a toast from anywhere under <ToastProvider> (components/Toast.tsx). */
export function useToast(): (toast: ToastInput) => void {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast needs a <ToastProvider> above it')
  return show
}
