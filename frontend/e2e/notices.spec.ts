import { expect, test } from '@playwright/test'

import { addMember, API, bearer, deleteHousehold, shared, signInPage } from './accounts.js'

// "Tôi đã chuyển" with money arriving in parts (specs/014-partial-transfer-notices, PR-1): Minh tells
// Tiến 100.000đ, Tiến records 60.000đ with "Nhận số khác", the 40.000đ left keeps waiting; he
// confirms it, then "Hoàn tác" gives the 40.000đ back as a waiting notice. Shared accounts, own house.

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
})

test('part of a told transfer is recorded, the rest keeps waiting, and undo gives it back', async ({ page, request }) => {
  const tien = shared('Tiến')
  const minh = shared('Minh')
  const name = `E2E notices ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const household = await (await request.post(`${API}/api/households`, { data: { name }, headers: bearer(tien) })).json()
  try {
    const tienId = household.member_id as number
    const minhId = await addMember(request, household.id, tien, minh)
    // Tiến paid 200.000đ for both: Minh owes him 100.000đ, and tells him he sent it
    const spent = await request.post(`${API}/api/households/${household.id}/expenses`, {
      data: {
        description: 'Tiền điện', amount: 200_000, payer_id: tienId, spent_at: new Date().toISOString().slice(0, 10),
        split: { type: 'equal', member_ids: [tienId, minhId] },
      },
      headers: bearer(tien),
    })
    expect(spent.status()).toBe(201)
    const told = await request.put(`${API}/api/households/${household.id}/notices`, {
      data: { to_member_id: tienId, amount: 100_000, version: null },
      headers: bearer(minh),
    })
    expect(told.status()).toBe(200)

    await page.setViewportSize({ width: 360, height: 800 })
    await signInPage(page, tien)
    await page.goto(`/households/${household.id}`)
    const transfers = page.getByRole('list', { name: 'Các lần trả gợi ý' })
    await expect(transfers.getByText(/Minh báo đã chuyển/)).toContainText('100.000đ')

    // Only 60.000đ arrived
    await transfers.getByRole('button', { name: 'Nhận số khác' }).click()
    const field = transfers.getByLabel('Số tiền đã nhận')
    await field.fill('60k')
    await expect(transfers.getByText('= 60.000đ')).toBeVisible()
    await field.press('Enter')
    await expect(page.getByRole('status').filter({ hasText: 'Đã ghi' })).toBeVisible()
    await expect(transfers.getByText(/Minh báo đã chuyển/).first()).toContainText('40.000đ')

    // The rest arrives; confirmed, then undone: the 40.000đ waits again
    await transfers.getByRole('button', { name: 'Xác nhận đã nhận 40.000đ' }).click()
    // The Hoàn tác of that 40.000đ, in its toast (the 60.000đ card has one too)
    await page.locator('.toast').filter({ hasText: /Đã ghi.*40\.000đ/ }).getByRole('button', { name: 'Hoàn tác' }).click()
    await expect(transfers.getByRole('button', { name: 'Xác nhận đã nhận 40.000đ' })).toBeVisible()
    const notices = await (await request.get(`${API}/api/households/${household.id}/notices`, { headers: bearer(tien) })).json()
    expect(notices.map((n: { amount: number; status: string }) => [n.amount, n.status])).toEqual([[40_000, 'sent']])
  } finally {
    const response = await deleteHousehold(request, household.id, tien)
    expect(response.status(), 'test household deleted').toBe(204)
  }
})
