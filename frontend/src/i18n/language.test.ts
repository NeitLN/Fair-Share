import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { LANGUAGE_KEY } from './language'

// The shared setup pins Vietnamese by saving it; these cases are about a device with no saved choice.
beforeEach(() => localStorage.removeItem(LANGUAGE_KEY))

// readLanguage() runs once when the module loads, so every case imports a fresh copy of it.
async function freshLanguage(): Promise<string> {
  vi.resetModules()
  const fresh = await import('./language')
  return fresh.language()
}

/** The browser the page is opened in: its languages list, and the single language it reports. */
function browser(languages: string[], language = ''): void {
  Object.defineProperty(navigator, 'languages', { configurable: true, get: () => languages })
  Object.defineProperty(navigator, 'language', { configurable: true, get: () => language })
}

afterEach(() => {
  const own = navigator as unknown as Record<string, unknown>
  delete own.languages
  delete own.language
  vi.restoreAllMocks()
})

test('a Vietnamese browser with nothing saved opens in Vietnamese', async () => {
  browser(['vi-VN', 'vi'])
  expect(await freshLanguage()).toBe('vi')
})

test("an English browser's first language wins over a later Vietnamese one", async () => {
  browser(['en-US', 'vi'])
  expect(await freshLanguage()).toBe('en')
})

test('no language at all opens in Vietnamese', async () => {
  browser([])
  expect(await freshLanguage()).toBe('vi')
})

test('blocked storage falls back to Vietnamese', async () => {
  browser(['en-US'])
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('storage blocked')
  })
  expect(await freshLanguage()).toBe('vi')
})

test('a saved English choice wins over a Vietnamese browser', async () => {
  localStorage.setItem(LANGUAGE_KEY, 'en')
  browser(['vi-VN'])
  expect(await freshLanguage()).toBe('en')
})

test('a saved Vietnamese choice wins over an English browser', async () => {
  localStorage.setItem(LANGUAGE_KEY, 'vi')
  browser(['en-US'])
  expect(await freshLanguage()).toBe('vi')
})
