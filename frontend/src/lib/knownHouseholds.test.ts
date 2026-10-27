import { afterEach, expect, test, vi } from 'vitest'

import { forget, KNOWN_KEY, putBack, readKnown, remember } from './knownHouseholds'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

test('the most recently created or opened household comes first, once', () => {
  remember(7)
  remember(9)
  remember(7)
  expect(readKnown()).toEqual([7, 9])
})

test('forget takes it off and says where it was; putBack restores that place', () => {
  remember(3)
  remember(9)
  remember(7)
  expect(forget(9)).toBe(1)
  expect(readKnown()).toEqual([7, 3])
  putBack(9, 1)
  expect(readKnown()).toEqual([7, 9, 3])
  expect(forget(42)).toBe(-1)
})

test('the first read picks up households used before the list existed, newest id first, once', () => {
  localStorage.setItem('fair-share:me:5', '1')
  localStorage.setItem('fair-share:last-payer:12', '2')
  localStorage.setItem('fair-share:me:12', '3')
  localStorage.setItem('fair-share:theme', 'dark')
  expect(readKnown()).toEqual([12, 5])

  // After that the saved list is the truth: forgetting one does not bring it back
  forget(5)
  expect(readKnown()).toEqual([12])
})

test('garbage in storage gives an empty or cleaned list, never an error', () => {
  localStorage.setItem(KNOWN_KEY, 'not json')
  expect(readKnown()).toEqual([])
  localStorage.setItem(KNOWN_KEY, JSON.stringify([7, '8', -1, 7, 2.5, 9]))
  expect(readKnown()).toEqual([7, 9])
})

test('blocked storage: nothing is remembered, nothing breaks', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  expect(() => remember(7)).not.toThrow()
  expect(readKnown()).toEqual([])
})
