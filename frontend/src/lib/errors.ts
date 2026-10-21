import { ApiError } from '../api/client'

// The API's error codes (app/errors.py, app/routers/*) in plain Vietnamese. The server's own
// message is English and meant for developers; users see these instead.
const MESSAGES: Record<string, string> = {
  validation_error: 'Thông tin chưa hợp lệ, hãy kiểm tra lại các ô.',
  household_not_found: 'Không tìm thấy nhà này.',
  member_not_found: 'Không tìm thấy thành viên này.',
  expense_not_found: 'Khoản chi này không còn nữa.',
  settlement_not_found: 'Khoản trả này không còn nữa.',
  member_name_taken: 'Nhà này đã có thành viên trùng tên.',
  member_in_use: 'Không xoá được: người này đã có trong một khoản chi hoặc khoản trả.',
  split_mismatch: 'Tổng các phần chưa bằng số tiền của khoản chi.',
  unknown_member: 'Có người không thuộc nhà này. Hãy tải lại trang rồi thử lại.',
  duplicate_member: 'Một người bị chọn hai lần trong phần chia.',
  same_member: 'Một người không thể tự trả cho chính mình.',
  database_unavailable: 'Máy chủ tạm thời không kết nối được dữ liệu. Thử lại sau ít phút.',
  database_not_configured: 'Máy chủ chưa được cấu hình cơ sở dữ liệu.',
  database_not_initialized: 'Cơ sở dữ liệu chưa sẵn sàng. Thử lại sau ít phút.',
  internal_error: 'Máy chủ gặp lỗi. Thử lại sau ít phút.',
  // AI Quick add (docs/DESIGN.md §6.3): every one leaves the typed sentence and the manual form usable
  no_members: 'Nhà chưa có thành viên. Thêm thành viên trước khi ghi khoản chi.',
  too_many_participants: 'Một khoản chi chia được cho tối đa 50 người. Chọn người cùng chia ở biểu mẫu.',
  ai_unparseable: 'AI chưa hiểu câu này. Bạn sửa câu rồi thử lại, hoặc điền biểu mẫu bên dưới.',
  ai_rate_limited: 'Gõ nhanh đang quá tải. Đợi một phút rồi thử lại, hoặc điền biểu mẫu bên dưới.',
  ai_unavailable: 'AI đang bận. Câu bạn gõ vẫn còn, điền biểu mẫu bên dưới là lưu được ngay.',
  ai_not_configured: 'Gõ nhanh chưa được bật trên máy chủ này. Bạn điền biểu mẫu bên dưới nhé.',
}

/** A message safe and readable for the user, for any error a query or mutation can throw. */
export function errorMessage(error: unknown): string | null {
  if (!error) return null
  if (error instanceof ApiError) {
    return MESSAGES[error.code] ?? error.message
  }
  return 'Đã có lỗi xảy ra. Thử lại sau ít phút.'
}
