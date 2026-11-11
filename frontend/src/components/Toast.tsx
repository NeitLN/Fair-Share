import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { useT } from '../i18n'
import {
  MAX_TOASTS,
  PHONE_TOAST_QUERY,
  SaveFeedbackContext,
  STICKY_SAVE_QUERY,
  TOAST_MS,
  ToastContext,
} from '../lib/toast'
import type { SaveFeedback, ToastInput } from '../lib/toast'

interface Toast extends ToastInput {
  id: number
}

/**
 * The toasts on screen, those waiting for room, and those that left whose owner has not been told yet
 * (DESIGN.md §5; specs/018 for waiting, "in use" and save errors).
 */
interface Toasts {
  shown: Toast[]
  waiting: Toast[]
  left: Toast[]
  /** "<id>:focus" and "<id>:pointer": a toast is in use while it has either (FR-015). */
  inUse: string[]
  /** Save errors on screen now: "saved" toasts are kept off while there is one (FR-012). */
  errors: number
}

const EMPTY: Toasts = {
  shown: [],
  waiting: [],
  left: [],
  inUse: [],
  errors: 0,
}

const used = (state: Toasts, toast: Toast) =>
  toast.sticky === true || state.inUse.some((key) => key.startsWith(`${toast.id}:`))
const isSuccess = (toast: Toast) => toast.kind === 'success'

// `told`: the departures whose owners had been told when the change was asked for. They are dropped
// here, in the next change, so nothing is dropped before its owner hears it.
function settle(state: Toasts, next: Partial<Toasts>, gone: Toast[], told: Set<number>): Toasts {
  const merged = { ...state, ...next }
  const live = new Set([...merged.shown, ...merged.waiting].map((toast) => toast.id))
  return {
    ...merged,
    inUse: merged.inUse.filter((key) => live.has(Number(key.split(':')[0]))),
    left: [...state.left.filter((toast) => !told.has(toast.id)), ...gone.filter((toast) => toast.onGone)],
  }
}

/**
 * Brings waiting toasts on screen when there is room. On a phone only the newest waiting one counts, and
 * it takes the place of a shown toast that nobody is using (FR-013).
 */
function promote(state: Toasts, phone: boolean, told: Set<number>): Toasts {
  if (state.waiting.length === 0) return state
  if (phone) {
    const current = state.shown[0]
    if (current && used(state, current)) return state
    const newest = state.waiting[state.waiting.length - 1]
    return settle(state, { shown: [newest], waiting: [] }, [...state.shown, ...state.waiting.slice(0, -1)], told)
  }
  const room = MAX_TOASTS - state.shown.length
  if (room <= 0) return state
  return settle(
    state,
    {
      shown: [...state.shown, ...state.waiting.slice(0, room)],
      waiting: state.waiting.slice(room),
    },
    [],
    told,
  )
}

function adding(state: Toasts, toast: Toast, phone: boolean, told: Set<number>): Toasts {
  // A "saved" toast is not shown next to a save error (FR-012)
  if (isSuccess(toast) && state.errors > 0) return settle(state, {}, [toast], told)
  // On a phone only the newest waits: the ones it passes leave now, so their undo closes as it would
  if (phone) return promote(settle(state, { waiting: [toast] }, state.waiting, told), phone, told)
  const next = [...state.shown, toast]
  if (next.length <= MAX_TOASTS) return settle(state, { shown: next }, [], told)
  // The oldest that nobody is using makes room; with every one in use, the new one waits
  const oldest = state.shown.find((shown) => !used(state, shown))
  if (!oldest) return settle(state, { waiting: [...state.waiting, toast] }, [], told)
  return settle(state, { shown: next.filter((shown) => shown.id !== oldest.id) }, [oldest], told)
}

function removing(state: Toasts, keep: (toast: Toast) => boolean, phone: boolean, told: Set<number>): Toasts {
  const gone = [...state.shown, ...state.waiting].filter((toast) => !keep(toast))
  if (gone.length === 0) return state
  return promote(
    settle(state, { shown: state.shown.filter(keep), waiting: state.waiting.filter(keep) }, gone, told),
    phone,
    told,
  )
}

const matches = (query: string) => typeof window.matchMedia === 'function' && window.matchMedia(query).matches

/** The sticky save bar on screen, if any (phone layout only): toasts must never cover it (FR-014). */
function stickyBar(): DOMRect | null {
  if (!matches(STICKY_SAVE_QUERY)) return null
  const height = window.visualViewport?.height ?? window.innerHeight
  const top = window.visualViewport?.offsetTop ?? 0
  for (const bar of document.querySelectorAll('.form-actions')) {
    const rect = bar.getBoundingClientRect()
    if (rect.height > 0 && rect.top < top + height && rect.bottom > top) return rect
  }
  return null
}

/** Where the toasts go: the usual bottom, just above a sticky save bar, or out of sight until they fit. */
type Placement = { at: 'bottom' } | { at: 'above'; top: number } | { at: 'hidden' }

const GAP = 8
/** The usual space under the toasts (index.css `.toasts` padding, without the safe area). */
const BOTTOM = 16

/** Toasts at the bottom of the screen (DESIGN.md §5); show one with useToast() from lib/toast. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const [state, setState] = useState<Toasts>(EMPTY)
  const toasts = state.shown
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  // Owners already told: a departure is in `left` for a while, its owner hears it once
  const told = useRef(new Set<number>())
  const phone = useRef(matches(PHONE_TOAST_QUERY))
  const region = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<Placement>({ at: 'bottom' })

  // Pure updates only: what changes on screen and who left are decided together, and acted on below
  // once React has committed them
  const update = useCallback((change: (current: Toasts, done: Set<number>) => Toasts) => {
    const done = new Set(told.current)
    setState((current) => change(current, done))
  }, [])

  const dismiss = useCallback(
    (id: number) => update((current, done) => removing(current, (toast) => toast.id !== id, phone.current, done)),
    [update],
  )

  const show = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++
      update((current, done) => adding(current, { ...input, id }, phone.current, done))
      return () => dismiss(id)
    },
    [update, dismiss],
  )

  // Focus and pointer are told apart: tabbing out under the pointer keeps the toast in use (review of #295)
  const setInUse = useCallback(
    (id: number, by: 'focus' | 'pointer', on: boolean) =>
      update((current, done) => {
        const key = `${id}:${by}`
        if (current.inUse.includes(key) === on) return current
        const next = { ...current, inUse: on ? [...current.inUse, key] : current.inUse.filter((x) => x !== key) }
        return on ? next : promote(next, phone.current, done)
      }),
    [update],
  )

  const feedback = useMemo<SaveFeedback>(
    () => ({
      started: (source) =>
        update((current, done) =>
          removing(
            current,
            (toast) => !(isSuccess(toast) && toast.source === source && !used(current, toast)),
            phone.current,
            done,
          ),
        ),
      errorShown: (focusTarget) => {
        // A "saved" toast holding the focus is taken away: the focus goes where the error says (FR-012)
        const focused = region.current?.contains(document.activeElement) ?? false
        update((current, done) =>
          removing({ ...current, errors: current.errors + 1 }, (toast) => !isSuccess(toast), phone.current, done),
        )
        if (focused) setTimeout(() => focusTarget?.()?.focus())
        let ended = false
        return () => {
          if (ended) return
          ended = true
          update((current) => ({
            ...current,
            errors: Math.max(0, current.errors - 1),
          }))
        }
      },
    }),
    [update],
  )

  // The width decides how many show at once; a change of width applies to the next toasts
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia(PHONE_TOAST_QUERY)
    const follow = () => {
      phone.current = query.matches
    }
    query.addEventListener?.('change', follow)
    return () => query.removeEventListener?.('change', follow)
  }, [])

  // Above the sticky save bar, measured, whatever its height is now (the error summary, the keyboard)
  const measure = useCallback(() => {
    const bar = stickyBar()
    if (!bar || toasts.length === 0) {
      setPlacement((current) => (current.at === 'bottom' ? current : { at: 'bottom' }))
      return
    }
    const needed = list.current?.getBoundingClientRect().height ?? 0
    const top = (window.visualViewport?.offsetTop ?? 0) + GAP
    // The usual place, at the bottom of the screen: kept whenever it does not reach the bar, e.g. once the
    // form is scrolled up and its bar moves with the page (review of #295)
    const screenBottom = top - GAP + (window.visualViewport?.height ?? window.innerHeight)
    const usualTop = screenBottom - BOTTOM - needed
    if (usualTop >= bar.bottom + GAP || screenBottom - BOTTOM <= bar.top - GAP) {
      setPlacement((current) => (current.at === 'bottom' ? current : { at: 'bottom' }))
      return
    }
    const above = bar.top - GAP - needed
    const next: Placement = above >= top ? { at: 'above', top: Math.floor(above) } : { at: 'hidden' }
    setPlacement((current) =>
      current.at === next.at && (next.at !== 'above' || (current.at === 'above' && current.top === next.top))
        ? current
        : next,
    )
  }, [toasts.length])

  useLayoutEffect(() => {
    measure()
  }, [measure, toasts])

  useEffect(() => {
    let frame = 0
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    window.addEventListener('scroll', later, true)
    window.addEventListener('resize', later)
    window.visualViewport?.addEventListener('resize', later)
    window.visualViewport?.addEventListener('scroll', later)
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(later) : null
    for (const bar of document.querySelectorAll('.form-actions')) observer?.observe(bar)
    if (list.current) observer?.observe(list.current)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', later, true)
      window.removeEventListener('resize', later)
      window.visualViewport?.removeEventListener('resize', later)
      window.visualViewport?.removeEventListener('scroll', later)
      observer?.disconnect()
    }
  }, [measure, toasts])

  // Out of sight with the focus in it: the focus goes to the save button of the form on screen
  const hidden = placement.at === 'hidden'
  useEffect(() => {
    if (!hidden || !region.current?.contains(document.activeElement)) return
    document.querySelector<HTMLElement>('.form-actions button[type="submit"]')?.focus()
  }, [hidden])

  // One timer per toast that is on screen, in sight, not in use and not sticky; it starts again from the
  // full time when that changes (FR-015). Running after every change also restores the timers after
  // StrictMode's unmount/remount in development.
  useEffect(() => {
    const running = timers.current
    const counting = new Set(
      toasts.filter((toast) => !hidden && !used(state, toast)).map((toast) => toast.id),
    )
    for (const id of counting) {
      if (!running.has(id))
        running.set(
          id,
          setTimeout(() => dismiss(id), TOAST_MS),
        )
    }
    for (const [id, timer] of running) {
      if (!counting.has(id)) {
        clearTimeout(timer)
        running.delete(id)
      }
    }
  }, [toasts, state.inUse, hidden, dismiss])

  // However a toast left (timed out, pushed out, skipped while waiting, acted on, dismissed), its owner
  // hears it once, from the committed state. It stays in `left` until the next change drops it.
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

  const style: CSSProperties | undefined =
    placement.at === 'above'
      ? { top: placement.top, bottom: 'auto', paddingBottom: 0 }
      : placement.at === 'hidden'
        ? { visibility: 'hidden' }
        : undefined

  return (
    <ToastContext.Provider value={show}>
      <SaveFeedbackContext.Provider value={feedback}>
        {children}
        <div ref={region} className="toasts" role="status" aria-live="polite" style={style}>
          {toasts.length > 0 && (
            <div ref={list} className="toast-list">
              {toasts.map((toast) => (
                <div
                  key={toast.id}
                  className="toast"
                  // The full text, also when a phone shows two lines of it (FR-014)
                  title={toast.text}
                  onFocus={() => setInUse(toast.id, 'focus', true)}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInUse(toast.id, 'focus', false)
                  }}
                  onPointerEnter={() => setInUse(toast.id, 'pointer', true)}
                  onPointerLeave={() => setInUse(toast.id, 'pointer', false)}
                >
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
                  {toast.sticky && (
                    <button type="button" className="btn-ghost toast-action" onClick={() => dismiss(toast.id)}>
                      {t.save.close}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SaveFeedbackContext.Provider>
    </ToastContext.Provider>
  )
}
