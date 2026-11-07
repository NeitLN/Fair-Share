/**
 * A picked photo made ready to send (specs/010-profile-page, FR-020): turned upright, the square from
 * its centre, 256 × 256, a JPEG. The preview shows exactly this, and the server checks and saves its
 * own copy of it again (app/services/images.py), so this is a convenience, never the safety check.
 */

export const MAX_PICK_BYTES = 10 * 1024 * 1024
export const PHOTO_SIDE = 256

export class PhotoPickError extends Error {
  readonly reason: 'too_big' | 'unreadable'

  constructor(reason: 'too_big' | 'unreadable') {
    super(reason)
    this.name = 'PhotoPickError'
    this.reason = reason
  }
}

/** The largest square in the middle of a width × height picture. */
export function centreSquare(width: number, height: number) {
  const side = Math.min(width, height)
  return { x: (width - side) / 2, y: (height - side) / 2, side }
}

export async function cropToSquare(file: Blob): Promise<Blob> {
  if (file.size > MAX_PICK_BYTES) throw new PhotoPickError('too_big')
  let bitmap: ImageBitmap
  try {
    // from-image applies the camera's orientation, so a phone photo taken sideways stands up
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Not a picture, or one this browser cannot open (HEIC on many browsers)
    throw new PhotoPickError('unreadable')
  }
  const { x, y, side } = centreSquare(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = PHOTO_SIDE
  canvas.height = PHOTO_SIDE
  const context = canvas.getContext('2d')
  if (!context) throw new PhotoPickError('unreadable')
  context.fillStyle = '#ffffff' // a transparent PNG gets a white background, as on the server
  context.fillRect(0, 0, PHOTO_SIDE, PHOTO_SIDE)
  context.drawImage(bitmap, x, y, side, side, 0, 0, PHOTO_SIDE, PHOTO_SIDE)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new PhotoPickError('unreadable'))), 'image/jpeg', 0.85),
  )
}
