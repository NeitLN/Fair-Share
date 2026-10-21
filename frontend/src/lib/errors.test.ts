import { describe, expect, test } from 'vitest'

import { ApiError } from '../api/client'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  test('no error, no message', () => {
    expect(errorMessage(null)).toBeNull()
  })

  test.each([
    ['split_mismatch', 'Tổng các phần chưa bằng số tiền của khoản chi.'],
    ['member_in_use', 'Không xoá được: người này đã có trong một khoản chi hoặc khoản trả.'],
    ['same_member', 'Một người không thể tự trả cho chính mình.'],
    ['database_unavailable', 'Máy chủ tạm thời không kết nối được dữ liệu. Thử lại sau ít phút.'],
  ])('a known code (%s) is shown in Vietnamese', (code, message) => {
    expect(errorMessage(new ApiError(422, code, 'English text for developers'))).toBe(message)
  })

  test('an unknown code falls back to the server message', () => {
    expect(errorMessage(new ApiError(418, 'teapot', 'I am a teapot'))).toBe('I am a teapot')
  })

  test('the network error from the client keeps its own Vietnamese message', () => {
    const offline = new ApiError(0, 'network_error', 'Không kết nối được tới máy chủ. Hãy thử lại.')
    expect(errorMessage(offline)).toBe('Không kết nối được tới máy chủ. Hãy thử lại.')
  })

  test('anything that is not an ApiError gets a generic message, never a stack trace', () => {
    expect(errorMessage(new TypeError('x is undefined'))).toBe('Đã có lỗi xảy ra. Thử lại sau ít phút.')
  })

  test.each([
    [
      'ai_rate_limited',
      'AI đang bận. Câu bạn gõ vẫn còn, điền form bên dưới là lưu được ngay.',
    ],
    [
      'ai_unavailable',
      'AI đang bận. Câu bạn gõ vẫn còn, điền form bên dưới là lưu được ngay.',
    ],
    ['ai_unparseable', 'AI chưa hiểu câu này. Câu bạn gõ vẫn còn, điền form bên dưới nhé.'],
    ['no_members', 'Nhà chưa có thành viên, hãy thêm thành viên trước.'],
    ['too_many_participants', 'Khoản này có quá nhiều người, hãy chọn người chia ở form.'],
  ])('the quick-add code (%s) is shown in Vietnamese', (code, message) => {
    expect(errorMessage(new ApiError(503, code, 'English text for developers'))).toBe(message)
  })
})
