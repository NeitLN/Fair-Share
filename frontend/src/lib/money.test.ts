import { describe, expect, test } from 'vitest'

import { formatSignedVND, formatVND } from './money'

describe('formatVND', () => {
  test('zero', () => {
    expect(formatVND(0)).toBe('0đ')
  })

  test('a typical expense: dot thousands, đ right after the number', () => {
    expect(formatVND(240000)).toBe('240.000đ')
  })

  test('a negative amount uses a real minus sign', () => {
    expect(formatVND(-50000)).toBe('−50.000đ')
  })

  test('a very large amount', () => {
    expect(formatVND(12500000)).toBe('12.500.000đ')
    expect(formatVND(1000000000)).toBe('1.000.000.000đ')
  })
})

describe('formatSignedVND', () => {
  test('credit gets a plus, debt a minus, zero neither', () => {
    expect(formatSignedVND(200000)).toBe('+200.000đ')
    expect(formatSignedVND(-120000)).toBe('−120.000đ')
    expect(formatSignedVND(0)).toBe('0đ')
  })
})
