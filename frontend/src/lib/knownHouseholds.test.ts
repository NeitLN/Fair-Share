import { afterEach, expect, test, vi } from 'vitest'

import { forget, inviteLink, keyFor, keyFromHash, KNOWN_KEY, putBack, readKnown, remember } from './knownHouseholds'

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

test('garbage in storage gives an empty list, never an error', () => {
  localStorage.setItem(KNOWN_KEY, 'not json')
  localStorage.setItem('fair-share:household-keys', '[1,2]')
  expect(readKnown()).toEqual([])
  expect(keyFor(1)).toBeNull()
})

test('blocked storage: nothing is remembered, nothing breaks', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  expect(() => remember(7, key('a'))).not.toThrow()
  expect(readKnown()).toEqual([])
})
