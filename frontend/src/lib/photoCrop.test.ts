import { afterEach, expect, test, vi } from 'vitest'

import { centreSquare, cropToSquare, MAX_PICK_BYTES, PhotoPickError } from './photoCrop'

afterEach(() => vi.unstubAllGlobals())

test('the square comes from the middle of a wide or a tall picture', () => {
  expect(centreSquare(400, 300)).toEqual({ x: 50, y: 0, side: 300 })
  expect(centreSquare(300, 400)).toEqual({ x: 0, y: 50, side: 300 })
  expect(centreSquare(256, 256)).toEqual({ x: 0, y: 0, side: 256 })
})

test('a file over 10 MB is refused before it is opened', async () => {
  const open = vi.fn()
  vi.stubGlobal('createImageBitmap', open)
  const huge = new Blob([new Uint8Array(MAX_PICK_BYTES + 1)])
  await expect(cropToSquare(huge)).rejects.toMatchObject({ reason: 'too_big' })
  expect(open).not.toHaveBeenCalled()
})

test('a file the browser cannot open (HEIC on many browsers) is unreadable', async () => {
  vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.reject(new Error('cannot decode'))))
  const error = await cropToSquare(new Blob(['not a picture'])).catch((e: unknown) => e)
  expect(error).toBeInstanceOf(PhotoPickError)
  expect((error as PhotoPickError).reason).toBe('unreadable')
})

test('the picture is drawn upright, from its centre square, into 256 × 256', async () => {
  const bitmap = { width: 400, height: 300, close: vi.fn() }
  const createImageBitmap = vi.fn(() => Promise.resolve(bitmap))
  vi.stubGlobal('createImageBitmap', createImageBitmap)
  const drawImage = vi.fn()
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (done: (b: Blob) => void, type: string) => done(new Blob(['jpeg'], { type })),
  }
  const create = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
    tag === 'canvas' ? (canvas as unknown as HTMLCanvasElement) : create(tag),
  )
  const blob = await cropToSquare(new Blob(['photo']))
  expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: 'from-image' })
  expect([canvas.width, canvas.height]).toEqual([256, 256])
  expect(drawImage).toHaveBeenCalledWith(bitmap, 50, 0, 300, 300, 0, 0, 256, 256)
  expect(blob.type).toBe('image/jpeg')
  expect(bitmap.close).toHaveBeenCalled()
  vi.restoreAllMocks()
})
