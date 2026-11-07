import { describe, expect, test } from 'vitest'

import { warningMessage } from './aiWarnings'

describe('warningMessage', () => {
  test('unknown_member names the person and points at payer and participants', () => {
    expect(
      warningMessage({ code: 'unknown_member', message: 'not a member', name: 'Hùng' }),
    ).toBe('“Hùng” không có trong nhà. Kiểm tra người trả và người cùng chia bên dưới.')
  })

  test('unknown_member without a name falls back to the server message', () => {
    expect(warningMessage({ code: 'unknown_member', message: 'not a member' })).toBe('not a member')
  })

  test('no_payer asks for the payer', () => {
    expect(warningMessage({ code: 'no_payer', message: 'Choose who paid' })).toBe(
      'Chọn người trả.',
    )
  })

  test('no_amount asks for the amount', () => {
    expect(warningMessage({ code: 'no_amount', message: 'Type the amount' })).toBe(
      'Nhập số tiền.',
    )
  })

  test('participants_assumed asks to check who shares it', () => {
    expect(
      warningMessage({ code: 'participants_assumed', message: 'Split between everyone' }),
    ).toBe('AI chia cho cả nhà, bạn kiểm tra lại.')
  })

  test('an unknown code keeps the server message', () => {
    expect(warningMessage({ code: 'something_new', message: 'Look at this' })).toBe('Look at this')
  })
})

describe('warningMessage, named amounts (specs/009-ai-custom-split)', () => {
  const plain = (text: string) => text.replace(/[\u00A0\u202F]/g, ' ')

  test('over_total gives both sums in money format', () => {
    expect(plain(warningMessage({ code: 'over_total', message: 'x', named_sum: 600_000, total: 500_000 }))).toBe(
      'Các phần đã nêu cộng lại 600.000đ, hơn tổng 500.000đ. Sửa lại cách chia rồi mới lưu được.',
    )
  })

  test('the codes about one name say the name', () => {
    expect(warningMessage({ code: 'ambiguous_member', message: 'x', name: 'Anh' })).toBe(
      '“Anh” trùng tên nhiều người trong nhà. Bạn tự chia giúp nhé.',
    )
    expect(warningMessage({ code: 'duplicate_member', message: 'x', name: 'Tien' })).toBe(
      'Tien được nêu hai số tiền. Bạn tự chia giúp nhé.',
    )
  })

  test('the codes about what is left say how much', () => {
    expect(plain(warningMessage({ code: 'no_rest_taker', message: 'x', remainder: 300_000 }))).toBe(
      'Còn 300.000đ chưa biết tính cho ai. Chọn người trả hoặc tự chia.',
    )
    expect(plain(warningMessage({ code: 'nobody_for_equal_rest', message: 'x', remainder: 500_000 }))).toBe(
      'Còn 500.000đ để chia đều nhưng ai cũng đã có phần. Bạn tự chia giúp nhé.',
    )
  })

  test.each([
    ['no_total', 'Nhập tổng số tiền rồi chia lại.'],
    ['fraction_or_percent', 'Chưa đọc được phần chia theo phân số hay phần trăm. Bạn tự chia giúp nhé.'],
    ['several_payers', 'Câu có nhiều người trả, mỗi khoản chi chỉ ghi một người trả. Bạn tự chia giúp nhé.'],
    ['paid_amount', 'Có số tiền là tiền ai đó đã trả, không phải phần phải chịu. Bạn tự chia giúp nhé.'],
    ['payer_not_sharing', 'Người trả không chia phần, nên phần còn lại chưa biết tính cho ai. Bạn tự chia giúp nhé.'],
    ['unreadable_shares', 'Chưa đọc được các phần chia. Bạn tự chia giúp nhé.'],
  ])('%s has its own sentence', (code, sentence) => {
    expect(warningMessage({ code, message: 'server text' })).toBe(sentence)
  })

  test('a figure missing falls back to the server message', () => {
    expect(warningMessage({ code: 'over_total', message: 'server text' })).toBe('server text')
  })
})
