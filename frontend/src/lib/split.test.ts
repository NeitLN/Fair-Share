import { describe, expect, test } from 'vitest'

import { equalSplit, parseAmount } from './split'

describe('equalSplit (same rule as the API)', () => {
  test('leftover đồng go to the lowest member ids', () => {
    expect([...equalSplit(100_000, [3, 1, 2])]).toEqual([
      [1, 33_334],
      [2, 33_333],
      [3, 33_333],
    ])
  })

  test('the shares always add up to the amount', () => {
    for (const [amount, n] of [[1, 3], [99_999, 7], [450_000, 4], [240_001, 5]]) {
      const ids = Array.from({ length: n }, (_, i) => i + 10)
      const total = [...equalSplit(amount, ids).values()].reduce((a, b) => a + b, 0)
      expect(total).toBe(amount)
    }
  })

  test('a duplicated id counts once, and nobody means no shares', () => {
    expect(equalSplit(1_000, [5, 5]).get(5)).toBe(1_000)
    expect(equalSplit(1_000, []).size).toBe(0)
  })
})

describe('parseAmount', () => {
  test.each([
    ['240000', 240_000],
    ['240.000', 240_000],
    ['240 000', 240_000],
    ['1,500,000', 1_500_000],
    ['240k', 240_000],
    [' 45K ', 45_000],
    ['12.5k', 12_500],
    ['1,25k', 1_250],
    // Millions, the way rent and bills are written (#141)
    ['2tr', 2_000_000],
    ['1tr5', 1_500_000],
    ['1tr500', 1_500_000],
    ['1tr25', 1_250_000],
    ['1tr050', 1_050_000],
    ['1,5tr', 1_500_000],
    ['1.5tr', 1_500_000],
    ['3,75tr', 3_750_000],
    ['2 triệu', 2_000_000],
    ['1,5 triệu', 1_500_000],
    ['2 trieu', 2_000_000],
    ['2 TR', 2_000_000],
    ['2 Triệu', 2_000_000],
    // "triệu" typed with combining accents (some keyboards)
    ['2 triệu', 2_000_000],
    // The same rule for thousands: digits after the unit are the fraction
    ['1k5', 1_500],
    ['2k250', 2_250],
  ])('"%s" is %d đồng', (text, amount) => {
    expect(parseAmount(text)).toBe(amount)
  })

  test.each([
    '', 'abc', '12.5', '1.2345k', '24.00', '-100', '1e6', 'k',
    // Millions: no number, two units, two separators, or a fraction finer than one đồng
    'tr', 'triệu', '1tr5k', '1k5tr', '1.2.3tr', '1,5tr5', '1tr1234567', '1,1234567tr',
  ])('"%s" is not an amount', (text) => {
    expect(parseAmount(text)).toBeNull()
  })

  test('millions stay exact up to the largest amount the API accepts', () => {
    expect(parseAmount('1000000tr')).toBe(1_000_000_000_000)
    expect(parseAmount('999999tr999999')).toBe(999_999_999_999)
  })

  test('absurdly long numbers are rejected instead of losing precision', () => {
    expect(parseAmount('9'.repeat(30))).toBeNull()
  })
})
