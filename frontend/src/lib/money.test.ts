import { describe, expect, test } from 'vitest'

import { formatVND } from './money'

// Intl inserts a non-breaking (sometimes narrow) space before ₫;
// normalize it so the assertions read plainly.
function plain(amount: number): string {
  return formatVND(amount).replace(/[\u00A0\u202F]/g, ' ')
}

describe('formatVND', () => {
  test('zero', () => {
    expect(plain(0)).toBe('0 ₫')
  })

  test('a typical expense', () => {
    expect(plain(240000)).toBe('240.000 ₫')
  })

  test('a negative amount', () => {
    expect(plain(-50000)).toBe('-50.000 ₫')
  })

  test('a very large amount', () => {
    expect(plain(1000000000)).toBe('1.000.000.000 ₫')
  })
})
