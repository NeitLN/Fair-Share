/** Format an integer đồng amount as Vietnamese đồng. Amount must be an integer. */
export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}
