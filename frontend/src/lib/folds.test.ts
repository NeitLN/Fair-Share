import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { foldOpen, rememberFold } from './folds'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

test('a fold starts closed and is remembered per house and per section', () => {
  expect(foldOpen(7, 'balances')).toBe(false)
  rememberFold(7, 'balances', true)
  expect(foldOpen(7, 'balances')).toBe(true)
  expect(foldOpen(7, 'month')).toBe(false)
  expect(foldOpen(8, 'balances')).toBe(false)
  rememberFold(7, 'balances', false)
  expect(foldOpen(7, 'balances')).toBe(false)
})

test('broken or foreign data reads as closed', () => {
  localStorage.setItem('fair-share:folds:7', '{not json')
  expect(foldOpen(7, 'history')).toBe(false)
  localStorage.setItem('fair-share:folds:7', '{"history": "yes"}')
  expect(foldOpen(7, 'history')).toBe(false)
  rememberFold(7, 'history', true)
  expect(foldOpen(7, 'history')).toBe(true)
})

test('without storage nothing breaks and every fold starts closed', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  })
  expect(() => rememberFold(7, 'month', true)).not.toThrow()
  expect(foldOpen(7, 'month')).toBe(false)
})
