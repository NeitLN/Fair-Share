import { afterEach, expect, test, vi } from 'vitest'

import {
  forget,
  inviteLink,
  keyFor,
  keyFromHash,
  keyWorks,
  KNOWN_KEY,
  putBack,
  readKnown,
  remember,
  restoreReplacedKey,
  savedOnThisDevice,
} from './knownHouseholds'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

const key = (c: string) => c.repeat(32)

test('the most recently created or opened household comes first, once', () => {
  remember(7, key('a'))
  remember(9, key('b'))
  remember(7)
  expect(readKnown()).toEqual([7, 9])
  expect(keyFor(9)).toBe(key('b'))
})

test('a household without a key is never listed: it could not be opened', () => {
  remember(7)
  localStorage.setItem(KNOWN_KEY, JSON.stringify([7, 9]))
  remember(9, key('b'))
  expect(readKnown()).toEqual([9])
})

test('forget drops the household and its key; putBack restores both, in the same place', () => {
  remember(3, key('a'))
  remember(9, key('b'))
  remember(7, key('c'))
  const forgotten = forget(9)
  expect(forgotten).toEqual({ at: 1, key: key('b') })
  expect(readKnown()).toEqual([7, 3])
  expect(keyFor(9)).toBeNull()
  putBack(9, forgotten)
  expect(readKnown()).toEqual([7, 9, 3])
  expect(keyFor(9)).toBe(key('b'))
})

test('an invite link carries the key after #, and only a key-shaped value counts', () => {
  expect(keyFromHash(`#k=${key('a')}`)).toBe(key('a'))
  expect(keyFromHash('#k=short')).toBeNull()
  expect(keyFromHash('#k=<script>')).toBeNull()
  expect(keyFromHash('')).toBeNull()
  remember(12, key('d'))
  expect(inviteLink(12)).toBe(`${window.location.origin}/households/12#k=${key('d')}`)
  expect(inviteLink(13)).toBeNull()
})

test('a key an invite link replaced comes back only if the new one fails, and only once', () => {
  remember(7, key('a'))
  remember(7, key('b')) // a link with another key
  expect(keyFor(7)).toBe(key('b'))
  expect(restoreReplacedKey(7)).toBe(true)
  expect(keyFor(7)).toBe(key('a'))
  // Nothing left to restore: a household that is really gone is forgotten as before
  expect(restoreReplacedKey(7)).toBe(false)

  remember(7, key('c'))
  keyWorks(7) // the API opened it with the new key
  expect(restoreReplacedKey(7)).toBe(false)
  expect(keyFor(7)).toBe(key('c'))
})

test('garbage in storage gives an empty list, never an error', () => {
  localStorage.setItem(KNOWN_KEY, 'not json')
  localStorage.setItem('fair-share:household-keys', '[1,2]')
  expect(readKnown()).toEqual([])
  expect(keyFor(1)).toBeNull()
})

test('blocked storage: nothing breaks, and the key still works for this visit', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  expect(savedOnThisDevice()).toBe(true)
  expect(() => remember(7, key('a'))).not.toThrow()
  // A household just created must open; it only will not survive a reload
  expect(readKnown()).toEqual([7])
  expect(keyFor(7)).toBe(key('a'))
  expect(savedOnThisDevice()).toBe(false)

  // Storage works again: the next write saves everything, and nothing is held back any more
  vi.restoreAllMocks()
  remember(9, key('b'))
  expect(savedOnThisDevice()).toBe(true)
  expect(JSON.parse(localStorage.getItem(KNOWN_KEY) as string)).toEqual([9, 7])
})
