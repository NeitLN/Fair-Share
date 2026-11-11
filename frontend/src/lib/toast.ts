import { createContext, useContext, useEffect, useRef } from 'react'

export interface ToastAction {
  label: string
  onAction: () => void
}

export interface ToastInput {
  text: string
  /** One action, e.g. "Hoàn tác". It belongs to this toast only, even when others appear after it. */
  action?: ToastAction
  /** Called once when the toast leaves: timed out, pushed out by newer ones, acted on or dismissed. */
  onGone?: () => void
  /** "success": says a money write went through (specs/018, FR-012); removed when a save error shows. */
  kind?: 'success' | 'info'
  /** Where the save it speaks for was started, e.g. "expense-form" or "transfer-3-5" (FR-012). */
  source?: string
  /** Never times out and has a close button: only a "result unknown" undo (FR-015). */
  sticky?: boolean
}

/** How long a toast stays (DESIGN.md §5): long enough to reach "Hoàn tác" with one hand. */
export const TOAST_MS = 7000
/** At most this many at once; the oldest goes first. Each keeps its own action. */
export const MAX_TOASTS = 3

/** Below this width one toast shows at a time, the next ones wait (specs/018, FR-013). */
export const PHONE_TOAST_QUERY = '(max-width: 599.98px)'
/** Below this width the expense form's save bar sticks to the bottom: toasts stay above it (FR-014). */
export const STICKY_SAVE_QUERY = '(max-width: 1023.98px)'

/** Shows a toast; the returned function takes it away early (e.g. when its action no longer applies). */
export type ShowToast = (toast: ToastInput) => () => void

export const ToastContext = createContext<ShowToast | null>(null)

/** Show a toast from anywhere under <ToastProvider> (components/Toast.tsx). */
export function useToast(): ShowToast {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast needs a <ToastProvider> above it')
  return show
}

/**
 * What money writes tell the toasts (specs/018, FR-012): a save started from `source` takes away the
 * "saved" toasts of that place that nobody is using; a save error on screen takes away every "saved"
 * toast and keeps new ones off until it is gone.
 */
export interface SaveFeedback {
  started: (source: string) => void
  /** Returns the function to call once the error is no longer on screen. */
  errorShown: (focusTarget?: () => HTMLElement | null) => () => void
}

const NO_FEEDBACK: SaveFeedback = { started: () => {}, errorShown: () => () => {} }

export const SaveFeedbackContext = createContext<SaveFeedback>(NO_FEEDBACK)

export const useSaveFeedback = (): SaveFeedback => useContext(SaveFeedbackContext)

/**
 * Tells the toasts while `message` (a save error) is on screen. `focusTarget`: where the focus goes if
 * it was on a "saved" toast that the error takes away.
 */
export function useVisibleSaveError(message: string | null | undefined, focusTarget?: () => HTMLElement | null) {
  const { errorShown } = useSaveFeedback()
  const target = useRef(focusTarget)
  useEffect(() => {
    target.current = focusTarget
  })
  useEffect(() => {
    if (!message) return undefined
    return errorShown(() => target.current?.() ?? null)
  }, [message, errorShown])
}
