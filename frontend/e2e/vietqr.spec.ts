import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'
import jsqrModule from 'jsqr'

import { vietqrPayload } from '../src/lib/vietqr.js'
import { addMember, API, bearer, deleteHousehold, shared, signInPage, signUp } from './accounts.js'

// Paying by VietQR (specs/016-vietqr, US2): Tiến owes Minh; Minh saved a receiving account (a made-up
// number). Tiến opens the code on Tổng quan: no request leaves Fair-Share (SC-005), and the code drawn on
// the page decodes to the payload of the API's answer (SC-003). Minh gets an account of his own: shared
// accounts are never changed. Own house, deleted at the end.

// jsqr is CommonJS: under Node's module rules its function may sit on `default`
type Decode = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null
const jsQR: Decode =
  (jsqrModule as unknown as { default?: Decode }).default ?? (jsqrModule as unknown as Decode)

/**
 * Rasterises the drawn SVG on a canvas in the page, over the page's own background, and decodes it here
 * with jsQR, an independent decoder. As an image the SVG loses the page's CSS (its colours are tokens),
 * so each shape's computed colour is copied onto it first.
 */
async function decodeOnPage(code: Locator) {
  const size = 400
  const pixels = await code.evaluate(async (svg, size) => {
    const copy = svg.cloneNode(true) as SVGElement
    for (const shape of ['.qr-light', '.qr-dark']) {
      copy.querySelector(shape)?.setAttribute('fill', getComputedStyle(svg.querySelector(shape) as Element).fill)
    }
    copy.setAttribute('width', String(size))
    copy.setAttribute('height', String(size))
    const image = new Image()
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d') as CanvasRenderingContext2D
    context.fillStyle = getComputedStyle(document.body).backgroundColor
    context.fillRect(0, 0, size, size)
    context.drawImage(image, 0, 0, size, size)
    return Array.from(context.getImageData(0, 0, size, size).data)
  }, size)
  return jsQR(Uint8ClampedArray.from(pixels), size, size)
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
})

test('the code on Tổng quan decodes to the right payload, and nothing leaves Fair-Share', async ({ page, request, baseURL }) => {
  const tien = shared('Tiến')
  const minh = await signUp(request, 'Minh')
  const name = `E2E vietqr ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const household = await (await request.post(`${API}/api/households`, { data: { name }, headers: bearer(tien) })).json()
  try {
    const minhId = await addMember(request, household.id, tien, minh)
    const spent = await request.post(`${API}/api/households/${household.id}/expenses`, {
      data: {
        description: 'Tiền nhà', amount: 240_000, payer_id: minhId, spent_at: new Date().toISOString().slice(0, 10),
        split: { type: 'equal', member_ids: [household.member_id, minhId] },
      },
      headers: bearer(tien),
    })
    expect(spent.status()).toBe(201)
    const saved = await request.put(`${API}/api/me/receiving-account`, {
      data: { bank_bin: '970436', account_number: '0918273645', holder_name: 'Minh E2E' },
      headers: bearer(minh),
    })
    expect(saved.status()).toBe(200)

    // Every request the page makes must go to Fair-Share's own web app or API
    const allowed = [new URL(baseURL ?? 'http://localhost').origin, new URL(API).origin]
    const outside: string[] = []
    page.on('request', (r) => {
      const origin = new URL(r.url()).origin
      if (!r.url().startsWith('data:') && !allowed.includes(origin)) outside.push(r.url())
    })

    await page.setViewportSize({ width: 360, height: 800 })
    await signInPage(page, tien)
    await page.goto(`/households/${household.id}`)
    await page.getByRole('button', { name: 'Mở mã QR' }).click()
    const code = page.getByRole('img', { name: /^Mã VietQR chuyển 120\.000đ cho Minh/ })
    await expect(code).toBeVisible()

    const decoded = await decodeOnPage(code)
    const answer = await (
      await request.get(`${API}/api/households/${household.id}/members/${minhId}/payment`, { headers: bearer(tien) })
    ).json()
    expect(decoded?.data).toBe(
      vietqrPayload({
        bin: answer.account.bank_bin,
        account: answer.account.account_number,
        amount: answer.amount,
        message: answer.message,
      }),
    )
    expect(decoded?.data).toContain('0918273645')
    expect(decoded?.data).toContain('5406120000')

    // The dark theme keeps the code black on white, so it still scans
    await page.emulateMedia({ colorScheme: 'dark' })
    expect((await decodeOnPage(code))?.data).toBe(decoded?.data)
    await page.emulateMedia({ colorScheme: 'light' })

    // Tiến tells 100.000đ: the code is for the 20.000đ not told yet
    const told = await request.put(`${API}/api/households/${household.id}/notices`, {
      data: { to_member_id: minhId, amount: 100_000, version: null },
      headers: bearer(tien),
    })
    expect(told.status()).toBe(200)
    await page.reload()
    await page.getByRole('button', { name: 'Mở mã QR' }).click()
    await expect(page.getByRole('img', { name: /^Mã VietQR chuyển 20\.000đ cho Minh/ })).toBeVisible()
    await expect(page.getByText('120.000đ cần trả, đã báo 100.000đ, còn 20.000đ chưa báo.')).toBeVisible()

    // Minh removes his account: opening again shows no code and no detail
    await page.getByRole('button', { name: 'Đóng' }).click()
    expect((await request.delete(`${API}/api/me/receiving-account`, { headers: bearer(minh) })).status()).toBe(204)
    await page.getByRole('button', { name: 'Mở mã QR' }).click()
    await expect(page.getByText('Không còn mã cho lần trả này.')).toBeVisible()
    await expect(page.getByText('0918273645')).toHaveCount(0)

    expect(outside).toEqual([])
  } finally {
    await deleteHousehold(request, household.id, tien)
  }
})
