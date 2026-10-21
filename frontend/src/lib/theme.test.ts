import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { THEME_KEY, applyTheme, readTheme, saveTheme, useTheme } from './theme'

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  vi.restoreAllMocks()
})

describe('theme', () => {
  test('nothing saved means "follow the phone", with no data-theme on <html>', () => {
    expect(readTheme()).toBe('system')
    applyTheme('system')
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  test('a forced theme is applied and remembered; "system" forgets it', () => {
    saveTheme('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(readTheme()).toBe('dark')

    saveTheme('system')
    expect(document.documentElement).not.toHaveAttribute('data-theme')
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  test('a value that is not a theme is ignored', () => {
    localStorage.setItem(THEME_KEY, 'purple')
    expect(readTheme()).toBe('system')
  })

  test('blocked storage (private mode) still changes the theme for this visit', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readTheme()).toBe('system')
    saveTheme('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  test('the hook starts from the saved choice and writes only when changed', () => {
    localStorage.setItem(THEME_KEY, 'light')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => useTheme())
    expect(result.current[0]).toBe('light')
    expect(setItem).not.toHaveBeenCalled()

    act(() => result.current[1]('dark'))
    expect(result.current[0]).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})
