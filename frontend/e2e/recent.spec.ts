import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

import { addMember, API, bearer, deleteHousehold, shared, signInPage } from './accounts.js'
import type { TestAccount } from './accounts.js'

// "Mới ghi" (specs/006-recently-added) in a real browser, with two accounts: what Minh records shows on
// Tiến's Tổng quan, opens its record, and "Đánh dấu đã xem hết" keeps it hidden until Minh records something
// newer. Own household and accounts through the API, always deleted at the end.

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
})

const today = new Date().toISOString().slice(0, 10)

async function makeHousehold(request: APIRequestContext) {
  const name = `E2E recent ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const tien = shared('Tiến')
  const minh = shared('Minh')
  const household = await (await request.post(`${API}/api/households`, { data: { name }, headers: bearer(tien) })).json()
  const tienId = household.member_id as number
  const minhId = await addMember(request, household.id, tien, minh)
  return { id: household.id as number, tien, minh, tienId, minhId }
}

async function addExpense(request: APIRequestContext, h: { id: number; tienId: number; minhId: number }, who: TestAccount, description: string) {
  const response = await request.post(`${API}/api/households/${h.id}/expenses`, {
    data: { description, amount: 90_000, payer_id: h.minhId, spent_at: today, split: { type: 'equal', member_ids: [h.tienId, h.minhId] } },
    headers: bearer(who),
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as number
}

test("a housemate's records show, open, and stay hidden once seen", async ({ page, request }) => {
  const h = await makeHousehold(request)
  try {
    // Tiến records one; Minh records one and receives a repayment from Tiến
    await addExpense(request, h, h.tien, 'Tiền điện của Tiến')
    const lau = await addExpense(request, h, h.minh, 'Lẩu tối')
    const repaid = await request.post(`${API}/api/households/${h.id}/settlements`, {
      data: { from_member_id: h.tienId, to_member_id: h.minhId, amount: 45_000, settled_at: today },
      headers: bearer(h.minh),
    })
    expect(repaid.status()).toBe(201)

    await page.setViewportSize({ width: 1440, height: 900 })
    await signInPage(page, h.tien)
    await page.goto(`/households/${h.id}`)
    const strip = page.getByRole('region', { name: 'Mới ghi' })
    await expect(strip.getByRole('link')).toHaveCount(2)
    const texts = await strip.locator('.recent-text').allTextContents()
    expect(texts).toEqual(['Minh xác nhận đã nhận 45.000đ từ bạn', 'Minh ghi Lẩu tối · 90.000đ'])

    // The expense opens in Chi tiêu
    await strip.getByRole('link', { name: /Lẩu tối/ }).click()
    await expect(page).toHaveURL(new RegExp(`/households/${h.id}/expenses$`))
    await expect(page.getByText('Lẩu tối').first()).toBeVisible()

    // Đánh dấu đã xem hết, then a reload: nothing
    await page.goto(`/households/${h.id}`)
    await strip.getByRole('button', { name: 'Đánh dấu đã xem hết 2 mục mới' }).click()
    await expect(strip).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('region', { name: 'Số dư từng người' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Mới ghi' })).toHaveCount(0)

    // Minh records something newer: only that one
    await addExpense(request, h, h.minh, 'Trà sữa')
    await page.reload()
    await expect(strip.locator('.recent-text')).toHaveText(['Minh ghi Trà sữa · 90.000đ'])
    expect(lau).toBeGreaterThan(0)
  } finally {
    const response = await deleteHousehold(request, h.id, h.tien)
    expect(response.status(), 'test household deleted').toBe(204)
  }
})
