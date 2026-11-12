import { expect, test } from 'vitest'

import en from './en'
import vi from './vi'

// Review 12/11, D10: a number and its unit, or the dots and the last four digits, never part at a line end
test('a number stays with its unit, and the hidden digits with the last four', () => {
  expect(vi.expenses.splitEqual(3)).toBe('chia đều 3 người')
  expect(vi.expenses.splitEqualOf(2, 3)).toBe('chia đều 2/3 người')
  expect(vi.expenses.splitCustom(2)).toBe('tự chia 2 người')
  expect(vi.members.receivingHint('VCB', '0915')).toContain('•••• 0915')
  expect(en.members.receivingHint('VCB', '0915')).toContain('•••• 0915')
  expect(en.expenses.splitEqualOf(2, 3)).toBe('split equally, 2 of 3')
})
