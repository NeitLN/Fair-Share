import { describe, expect, test } from 'vitest'

import { warningMessage } from './aiWarnings'

describe('warningMessage', () => {
  test('unknown_member names the person as written and points at the form', () => {
    expect(
      warningMessage({ code: 'unknown_member', message: 'not a member', name: 'Hùng' }),
    ).toBe('“Hùng” không có trong nhà. Chọn người ở form.')
  })

  test('unknown_member without a name falls back to the server message', () => {
    expect(warningMessage({ code: 'unknown_member', message: 'not a member' })).toBe('not a member')
  })

  test('no_payer asks for the payer', () => {
    expect(warningMessage({ code: 'no_payer', message: 'Choose who paid' })).toBe(
      'AI chưa biết ai trả, hãy chọn người trả.',
    )
  })

  test('no_amount asks for the amount', () => {
    expect(warningMessage({ code: 'no_amount', message: 'Type the amount' })).toBe(
      'AI chưa thấy số tiền, hãy nhập số tiền.',
    )
  })

  test('participants_assumed asks to check who shares it', () => {
    expect(
      warningMessage({ code: 'participants_assumed', message: 'Split between everyone' }),
    ).toBe('AI chia đều cho cả nhà, kiểm tra lại người cùng chia.')
  })

  test('an unknown code keeps the server message', () => {
    expect(warningMessage({ code: 'something_new', message: 'Look at this' })).toBe('Look at this')
  })
})
