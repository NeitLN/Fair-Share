import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

import { addMember, API, bearer, deleteHousehold, shared, signInPage } from './accounts.js'
import type { TestAccount } from './accounts.js'

// Recurring expenses (specs/007-recurring-expenses) in a real browser. An item due today is made
// through the API (made from an expense, whose deletion frees this month), then Tiến records it from
// "Đến ngày ghi" in two presses; the server refuses a second expense of it this month. Own household and
// accounts, always deleted at the end.

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
})

const pad = (n: number) => String(n).padStart(2, '0')
const now = new Date()
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

async function dueItem(request: APIRequestContext) {
  const name = `E2E recurring ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const tien = shared('Tiến')
  const minh = shared('Minh')
  const household = await (await request.post(`${API}/api/households`, { data: { name }, headers: bearer(tien) })).json()
  const ids = [household.member_id as number, await addMember(request, household.id, tien, minh)]
  // Minh makes "Internet" recur from an expense, then deletes that expense: this month is due again
  const made = await request.post(`${API}/api/households/${household.id}/expenses`, {
    data: { description: 'Internet', amount: 300_000, payer_id: ids[1], spent_at: today, category: 'utilities',
      split: { type: 'equal', member_ids: ids }, recurring: { varying_amount: false } },
    headers: bearer(minh),
  })
  expect(made.status()).toBe(201)
  const { id: expenseId, recurring_item_id: itemId } = await made.json()
  expect((await request.delete(`${API}/api/expenses/${expenseId}`, { headers: bearer(minh) })).status()).toBe(204)
  return { id: household.id as number, tien: tien as TestAccount, ids, itemId: itemId as number }
}

test('a due item is recorded from Tổng quan in two presses, once', async ({ page, request }) => {
  const h = await dueItem(request)
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signInPage(page, h.tien)
    await page.goto(`/households/${h.id}`)
    const card = page.getByRole('region', { name: 'Đến ngày ghi' })
    await expect(card).toContainText('Internet')
    await expect(card).toContainText('300.000đ · Minh trả')
    // The right column did not move: Báo cáo tháng is still in the first screen
    await expect(page.getByRole('link', { name: 'Báo cáo tháng' })).toBeInViewport()

    await card.getByRole('link', { name: 'Ghi Internet tháng này' }).click()
    await expect(page).toHaveURL(new RegExp(`/households/${h.id}/expenses$`))
    await expect(page.getByLabel('Nội dung')).toHaveValue('Internet')
    await expect(page.getByText(/^Đang ghi kỳ/)).toBeVisible()
    await page.getByRole('button', { name: 'Lưu khoản chi' }).click()
    await expect(page.getByRole('row', { name: /Internet/ })).toBeVisible()

    await page.goto(`/households/${h.id}`)
    await expect(page.getByRole('region', { name: 'Số dư từng người' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Đến ngày ghi' })).toHaveCount(0)

    // A second expense of the item this month is refused by the server
    const again = await request.post(`${API}/api/households/${h.id}/expenses`, {
      data: { description: 'Internet', amount: 300_000, payer_id: h.ids[1], spent_at: today,
        split: { type: 'equal', member_ids: h.ids }, recurring_item_id: h.itemId },
      headers: bearer(h.tien),
    })
    expect(again.status()).toBe(409)
    expect((await again.json()).error.code).toBe('recurring_month_taken')
  } finally {
    const response = await deleteHousehold(request, h.id, h.tien)
    expect(response.status(), 'test household deleted').toBe(204)
  }
})
