import { describe, expect, test } from 'vitest'

import type { Member } from '../api/types'
import { initialOf, memberLooks, shortNames, tints } from './names'

const T = '2026-10-20T10:00:00Z'
const member = (id: number, name: string): Member => ({ id, household_id: 1, name, created_at: T })

describe('shortNames', () => {
  test('everyone is called by the last word of their name', () => {
    const names = shortNames([member(1, 'Võ Việt Tiến'), member(2, 'Hoàng Minh'), member(3, 'Lan')])
    expect([...names.values()]).toEqual(['Tiến', 'Minh', 'Lan'])
  })

  test('two people with the same last word get their last two words', () => {
    const names = shortNames([member(1, 'Nguyễn Duy Anh'), member(2, 'Tuấn Anh'), member(3, 'Minh')])
    expect(names.get(1)).toBe('Duy Anh')
    expect(names.get(2)).toBe('Tuấn Anh')
    expect(names.get(3)).toBe('Minh')
  })

  test('the clash ignores case', () => {
    const names = shortNames([member(1, 'Trần anh'), member(2, 'Lê Anh')])
    expect(names.get(1)).toBe('Trần anh')
    expect(names.get(2)).toBe('Lê Anh')
  })

  test('when the last two words still match, the full name', () => {
    const names = shortNames([member(1, 'Nguyễn Duy Anh'), member(2, 'Trần Duy Anh')])
    expect(names.get(1)).toBe('Nguyễn Duy Anh')
    expect(names.get(2)).toBe('Trần Duy Anh')
  })

  test('extra spaces do not count as words', () => {
    expect(shortNames([member(1, '  Hoàng   Minh ')]).get(1)).toBe('Minh')
  })
})

describe('initialOf', () => {
  test('the given name, not the family name', () => {
    expect(initialOf('Nguyễn Duy Anh')).toBe('A')
    expect(initialOf('Lan')).toBe('L')
  })

  test('Vietnamese letters stay whole', () => {
    expect(initialOf('Trần Đức')).toBe('Đ')
    expect(initialOf('ánh')).toBe('Á')
  })
})

describe('tints', () => {
  test('each member prefers id mod 8, shown as 1–8', () => {
    const colours = tints([member(11, 'A'), member(12, 'B')])
    expect(colours.get(11)).toBe(4) // 11 mod 8 = 3 → tint 4
    expect(colours.get(12)).toBe(5)
  })

  test('a clash takes the next free tint, so a small house never repeats a colour', () => {
    const colours = tints([member(3, 'A'), member(11, 'B'), member(19, 'C')]) // all prefer slot 3
    expect([colours.get(3), colours.get(11), colours.get(19)]).toEqual([4, 5, 6])
  })

  test('adding a member never recolours anyone', () => {
    const before = tints([member(5, 'A'), member(9, 'B')])
    const after = tints([member(5, 'A'), member(9, 'B'), member(13, 'C')])
    expect(after.get(5)).toBe(before.get(5))
    expect(after.get(9)).toBe(before.get(9))
  })

  test('removing someone recolours only a member who had been pushed off a taken tint', () => {
    const before = tints([member(3, 'A'), member(11, 'B'), member(22, 'C')])
    const after = tints([member(11, 'B'), member(22, 'C')]) // A (slot 3) removed
    expect(after.get(22)).toBe(before.get(22)) // C (slot 6) never clashed
    expect(before.get(11)).toBe(5) // B had been pushed from slot 3 to 4…
    expect(after.get(11)).toBe(4) // …and gets the slot it preferred back
  })

  test('the order members arrive in does not matter', () => {
    expect(tints([member(19, 'C'), member(3, 'A'), member(11, 'B')])).toEqual(
      tints([member(3, 'A'), member(11, 'B'), member(19, 'C')]),
    )
  })

  test('nine members: eight distinct tints, then repeats are allowed', () => {
    const colours = tints(Array.from({ length: 9 }, (_, i) => member(i + 1, `M${i}`)))
    expect(new Set([...colours.values()].slice(0, 8)).size).toBe(8)
    expect(colours.size).toBe(9)
  })
})

describe('memberLooks', () => {
  test('one entry per member with full name, short name, initial and tint', () => {
    const looks = memberLooks([member(1, 'Nguyễn Duy Anh')])
    expect(looks.get(1)).toEqual({ full: 'Nguyễn Duy Anh', short: 'Anh', initial: 'A', tint: 2 })
  })
})
