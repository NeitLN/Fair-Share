import type { DraftWarning } from '../api/types'

/**
 * A Vietnamese sentence for one warning in an AI draft. Known codes say what to fix in the form;
 * anything else falls back to the server's own text.
 */
export function warningMessage(warning: DraftWarning): string {
  switch (warning.code) {
    case 'unknown_member':
      return warning.name
        ? `“${warning.name}” không có trong nhà. Kiểm tra người trả và người cùng chia ở biểu mẫu.`
        : warning.message
    case 'no_payer':
      return 'Chọn người trả.'
    case 'no_amount':
      return 'Nhập số tiền.'
    case 'participants_assumed':
      return 'AI chia cho cả nhà, bạn kiểm tra lại.'
    default:
      return warning.message
  }
}
