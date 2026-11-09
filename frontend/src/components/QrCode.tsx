import qrcode from 'qrcode-generator'
import { useMemo } from 'react'

const QUIET_ZONE = 4 // modules of light margin around the symbol, as scanners expect

interface QrCodeProps {
  payload: string
  /** What the code is, for screen readers: "Mã VietQR chuyển 120.000đ cho Minh". */
  label: string
}

/**
 * A QR code drawn as one SVG path (specs/016-vietqr, research R1): error correction level M, the
 * smallest version that fits, on a light square in both themes so it scans in the dark theme too. The
 * library only computes the modules; nothing is sent anywhere and nothing is stored.
 */
export function QrCode({ payload, label }: QrCodeProps) {
  const { size, path } = useMemo(() => {
    const code = qrcode(0, 'M')
    code.addData(payload, 'Byte')
    code.make()
    const count = code.getModuleCount()
    let d = ''
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (code.isDark(row, col)) d += `M${col + QUIET_ZONE},${row + QUIET_ZONE}h1v1h-1z`
      }
    }
    return { size: count + 2 * QUIET_ZONE, path: d }
  }, [payload])

  return (
    <svg
      className="qr-code"
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect className="qr-light" width={size} height={size} />
      <path className="qr-dark" d={path} />
    </svg>
  )
}
