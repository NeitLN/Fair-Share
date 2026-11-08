import { useSyncExternalStore } from 'react'

/** The app speaks Vietnamese unless the browser's first language is English; the header switches. */
export type Language = 'en' | 'vi'

export const LANGUAGE_KEY = 'fair-share:language'

function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'vi'
}

/**
 * The saved choice; otherwise Vietnamese, unless the browser's first language starts with `en`.
 * Storage blocked (private mode) or any other failure still opens in Vietnamese.
 */
function readLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY)
    if (isLanguage(saved)) return saved
    const first = (navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase()
    return first.startsWith('en') ? 'en' : 'vi'
  } catch {
    return 'vi'
  }
}

// One value for the whole page: components re-render through useLanguage(), and plain functions
// (formatVND, errorMessage, the reminder text…) read it with language()
let active: Language = readLanguage()
const listeners = new Set<() => void>()
// Screen readers pick their voice from <html lang>, so it follows the saved choice from the start
document.documentElement.lang = active

/** The language the page is in right now. */
export const language = () => active

/** Switch the whole page and remember it on this device (it still switches when storage is blocked). */
export function setLanguage(next: Language): void {
  active = next
  document.documentElement.lang = next
  try {
    localStorage.setItem(LANGUAGE_KEY, next)
  } catch {
    // Storage blocked: fine for this visit
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current language; the component re-renders when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, language)
}
