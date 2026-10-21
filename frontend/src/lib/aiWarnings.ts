import type { DraftWarning } from '../api/types'

/**
 * A Vietnamese sentence for one warning in an AI draft. Known codes say what to fix in the form;
 * anything else falls back to the server's own text.
 */
export function warningMessage(warning: DraftWarning): string {
  switch (warning.code) {
    case 'unknown_member':
      return warning.name
        ? `“${warning.name}” không có trong nhà. Chọn người ở form.`
        : warning.message
    case 'no_payer':
      return 'AI chưa biết ai trả, hãy chọn người trả.'
    case 'no_amount':
      return 'AI chưa thấy số tiền, hãy nhập số tiền.'
    case 'participants_assumed':
      return 'AI chia đều cho cả nhà, kiểm tra lại người cùng chia.'
    default:
      return warning.message
  }
}
