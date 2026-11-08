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
    [
      'notice_changed',
      'Thông báo này vừa thay đổi hoặc đã được trả lời. Số liệu đang tải lại, bạn xem lại khi số mới hiện ra nhé.',
    ],
    [
      'suggestion_changed',
      'Số tiền gợi ý vừa đổi. Số liệu đang tải lại, bạn xem lại rồi báo lại nhé.',
    ],
    ['database_unavailable', 'Máy chủ tạm thời không kết nối được dữ liệu. Thử lại sau ít phút.'],
    ['ai_not_configured', 'Gõ nhanh chưa được bật. Bạn nhập thông tin bên dưới nhé.'],
    ['ai_unavailable', 'AI tạm thời không dùng được. Câu bạn gõ vẫn còn; bạn có thể nhập thông tin bên dưới rồi lưu.'],
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
    ['ai_rate_limited', 'Gõ nhanh đã đạt giới hạn lượt dùng. Bạn có thể nhập thông tin bên dưới hoặc thử lại sau.'],
    ['ai_unparseable', 'AI chưa hiểu câu này. Bạn sửa câu rồi thử lại, hoặc nhập thông tin bên dưới.'],
    ['no_members', 'Nhà chưa có thành viên. Thêm thành viên trước khi ghi khoản chi.'],
    [
      'too_many_participants',
      'Một khoản chi chia được cho tối đa 50 người. Chọn lại người cùng chia bên dưới.',
    ],
  ])('the quick-add code (%s) is shown in Vietnamese', (code, message) => {
    expect(errorMessage(new ApiError(503, code, 'English text for developers'))).toBe(message)
  })
})
