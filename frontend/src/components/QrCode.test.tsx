import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { QrCode } from './QrCode'

const PAYLOAD =
  '00020101021238540010A00000072701240006970436011001234567890208QRIBFTTA530370454061200005802VN62190815FS NHATROQ7 LAN6304D2EF'

test('draws the code as one path on a light square with a quiet zone, labelled', () => {
  render(<QrCode payload={PAYLOAD} label="Mã VietQR chuyển 120.000đ cho Minh" />)
  const svg = screen.getByRole('img', { name: 'Mã VietQR chuyển 120.000đ cho Minh' })
  const [size] = (svg.getAttribute('viewBox') ?? '').split(' ').slice(2).map(Number)
  // At least a version 1 symbol (21 modules) plus 4 modules of quiet zone on each side
  expect(size).toBeGreaterThanOrEqual(29)
  expect(svg.querySelector('rect.qr-light')).not.toBeNull()
  const path = svg.querySelector('path.qr-dark')?.getAttribute('d') ?? ''
  expect(path.length).toBeGreaterThan(100)
  // Nothing is drawn inside the quiet zone
  expect(path.startsWith('M4,4') || /^M\d+,4/.test(path)).toBe(true)
})

test('the same payload always draws the same code', () => {
  const first = render(<QrCode payload={PAYLOAD} label="a" />).container.innerHTML
  const second = render(<QrCode payload={PAYLOAD} label="a" />).container.innerHTML
  expect(second).toBe(first)
})
