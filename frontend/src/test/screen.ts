import { vi } from 'vitest'

/** The page is shown on a computer (lib/useWide.ts): jsdom has no matchMedia, so tests are a phone. */
export function onAComputer() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(min-width: 1024px)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}
