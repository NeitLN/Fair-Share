// Built once: creating an Intl.NumberFormat is far slower than calling format()
const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

/** Format an integer đồng amount as Vietnamese đồng, e.g. 240000 → "240.000 ₫". */
export function formatVND(amount: number): string {
  return vnd.format(amount)
}
