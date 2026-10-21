import { useCallback, useState } from 'react'

/** "system" follows the phone; the other two force a theme (docs/DESIGN.md §3). */
export type ThemeChoice = 'system' | 'light' | 'dark'

// The same key is read by the inline script in index.html, before React, so the page never flashes
export const THEME_KEY = 'fair-share:theme'

function isChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark'
}

/** The saved choice; "system" when nothing is saved or storage is blocked (private mode). */
export function readTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return isChoice(saved) ? saved : 'system'
  } catch {
    return 'system'
  }
}

// The browser bar colour per theme: the same values as --bg in tokens.css
const BAR_COLOUR: Record<'light' | 'dark', string> = { light: '#f3f0fc', dark: '#110e1c' }

/** data-theme on <html> is what tokens.css reads; no attribute means "follow the phone". */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)

  // index.html has one theme-color per colour scheme; a forced theme makes both say the same
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][media]').forEach((meta) => {
    const scheme = (meta.getAttribute('media') ?? '').includes('dark') ? 'dark' : 'light'
    meta.content = BAR_COLOUR[choice === 'system' ? scheme : choice]
  })
}

/** Apply and remember; the theme still changes when storage is blocked, it just is not kept. */
export function saveTheme(choice: ThemeChoice): void {
  applyTheme(choice)
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, choice)
  } catch {
    // Storage blocked: fine for this visit
  }
}

/** The current choice and a setter for the header's theme switch. Reading never writes. */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme)
  const change = useCallback((next: ThemeChoice) => {
    saveTheme(next)
    setChoice(next)
  }, [])
  return [choice, change]
}
