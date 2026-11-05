import { describe, expect, test } from 'vitest'

import type { Category, Expense } from '../api/types'
import { CATEGORIES, categoryTotals, guessCategory } from './categories'

describe('guessCategory', () => {
  test.each<[string, Category]>([
    // The demo house's five expenses (db/seed.sql), research R3 and SC-002
    ['Tiền nhà tháng trước', 'rent'],
    ['Đi chợ cuối tuần', 'groceries'],
    ['Tiền điện', 'utilities'],
    ['Lẩu thứ sáu', 'food'],
    ['Mì gói và trứng', 'groceries'],
    // More of what people type
    ['Tiền nước tháng 11', 'utilities'],
    ['Nước mắm', 'groceries'],
    ['Mua bóng đèn', 'household'],
    ['Đổ xăng', 'transport'],
    ['Grab về nhà', 'transport'],
    ['Wifi tháng 11', 'utilities'],
    ['Trà sữa', 'food'],
    ['cafe sáng', 'food'],
    ['Cà phê', 'food'],
    // Without accents, upper case, or with punctuation it is the same
    ['LAU NUONG', 'food'],
    ['lẩu nướng!', 'food'],
    ['tien dien', 'utilities'],
    // "cho" (chợ / cho), "ca" (cá / cả), "an" (ăn / the name An), "trung" (trứng / Trung) only count
    // inside a phrase (review of #199)
    ['Tiền điện cho cả nhà', 'utilities'],
    ['Tiền nhà tháng 11 trả cho chủ trọ', 'rent'],
    ['Đổ xăng cho xe', 'transport'],
    ['Mua đồ dùng cho cả phòng', 'household'],
    ['Tiền điện, An trả', 'utilities'],
    ['Trung ứng trước tiền nhà', 'rent'],
    ['Mua cá lóc', 'groceries'],
    // "tien cho" is also "tiền cho", "mua ca" also "mua cả": not phrases either (second review of #199)
    ['Đưa tiền cho An', 'other'],
    ['Chuyển tiền cho Trung', 'other'],
    ['Trả tiền cho chủ trọ', 'other'],
    ['Tiền cho thuê xe', 'transport'],
    ['Mua cả bộ chén bát', 'household'],
    ['Mua cả thùng nước rửa chén', 'household'],
    ['Đi chợ sáng', 'groceries'],
    ['Ăn tối', 'food'],
    ['Đi ăn', 'food'],
    ['Trứng gà', 'groceries'],
    // Nothing that matches a whole word
    ['Quần áo', 'other'],
    ['Gửi cho Minh', 'other'],
    ['Cả nhà', 'other'],
    ['Mua gà', 'other'],
    ['Nước suối', 'other'],
    ['', 'other'],
    ['   ', 'other'],
  ])('"%s" → %s', (description, category) => {
    expect(guessCategory(description)).toBe(category)
  })

  test('the first category in the fixed order wins', () => {
    // Both match: Điện nước (3rd in FR-001's order) comes before Tiền nhà (4th)
    expect(guessCategory('Tiền nhà và tiền điện')).toBe('utilities')
    expect(guessCategory('Ăn lẩu ở chợ')).toBe('food')
  })
})

const expense = (id: number, amount: number, category: Category) =>
  ({ id, amount, category, spent_at: '2026-11-03', shares: [] }) as unknown as Expense

describe('categoryTotals', () => {
  test('largest first, adding up to the month, with whole percentages that add up to 100', () => {
    const totals = categoryTotals([
      expense(1, 4_500_000, 'rent'),
      expense(2, 360_000, 'groceries'),
      expense(3, 100_000, 'groceries'),
      expense(4, 450_000, 'utilities'),
      expense(5, 240_000, 'food'),
    ])
    expect(totals.map((t) => [t.category, t.amount])).toEqual([
      ['rent', 4_500_000],
      ['groceries', 460_000],
      ['utilities', 450_000],
      ['food', 240_000],
    ])
    expect(totals.reduce((sum, t) => sum + t.amount, 0)).toBe(5_650_000)
    expect(totals.reduce((sum, t) => sum + t.percent, 0)).toBe(100)
    expect(totals.map((t) => t.percent)).toEqual([80, 8, 8, 4])
  })

  test('three equal categories read 34 / 33 / 33, the extra point to the first in order', () => {
    const totals = categoryTotals([expense(1, 100, 'other'), expense(2, 100, 'food'), expense(3, 100, 'rent')])
    expect(totals.map((t) => [t.category, t.percent])).toEqual([
      ['food', 34],
      ['rent', 33],
      ['other', 33],
    ])
  })

  test('a share under 1% is tiny, reads as <1%, and the others still add up to 100', () => {
    const totals = categoryTotals([expense(1, 3_999_000, 'rent'), expense(2, 1_000, 'household')])
    expect(totals).toEqual([
      { category: 'rent', amount: 3_999_000, percent: 100, tiny: false },
      { category: 'household', amount: 1_000, percent: 0, tiny: true },
    ])
  })

  test('nothing spent, no lines', () => {
    expect(categoryTotals([])).toEqual([])
  })

  test('the seven categories in their fixed order', () => {
    expect(CATEGORIES).toEqual(['food', 'groceries', 'utilities', 'rent', 'transport', 'household', 'other'])
  })
})
