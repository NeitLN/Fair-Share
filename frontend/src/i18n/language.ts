import { useSyncExternalStore } from 'react'

/** The app speaks English by default; Vietnamese is one tap away in the header. */
export type Language = 'en' | 'vi'

export const LANGUAGE_KEY = 'fair-share:language'

function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'vi'
}

/** The saved choice; English when nothing is saved or storage is blocked (private mode). */
function readLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY)
    return isLanguage(saved) ? saved : 'en'
  } catch {
    return 'en'
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
