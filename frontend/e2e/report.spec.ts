import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

import { addMember, API, bearer, deleteHousehold, shared, signInPage } from './accounts.js'
import type { TestAccount } from './accounts.js'

// "Báo cáo tháng" (specs/004-monthly-report) in a real browser: opened from Tổng quan, it ends on the
// balances, steps back a month, and a stranger cannot open it. Like the other walks it builds its own
// household through the API with its own accounts and always deletes it.

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
})

const pad = (n: number) => String(n).padStart(2, '0')
const now = new Date()
const thisMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
const before = new Date(now.getFullYear(), now.getMonth() - 1, 1)
const lastMonth = `${before.getFullYear()}-${pad(before.getMonth() + 1)}`
const today = `${thisMonth}-${pad(now.getDate())}`

/** "+70.000đ", "−30.000đ", "0đ", as the page writes a balance in Vietnamese (lib/money.ts). */
const signed = (amount: number) =>
  `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${Math.abs(amount).toLocaleString('vi-VN')}đ`

/**
 * Last month Tiến paid 300.000đ for the three and received 100.000đ back from Minh; this month Duy Anh
 * paid 90.000đ for the three. Ends: last month Tiến +100.000, Minh 0, Duy Anh −100.000; this month
 * Tiến +70.000, Minh −30.000, Duy Anh −40.000.
 */
async function makeHousehold(request: APIRequestContext) {
  const name = `E2E report ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const tien = shared('Tiến')
  const household = await (await request.post(`${API}/api/households`, { data: { name }, headers: bearer(tien) })).json()
  const ids = [household.member_id as number]
  for (const member of ['Minh', 'Duy Anh'] as const) {
    ids.push(await addMember(request, household.id, tien, shared(member)))
  }
  const [tienId, minhId, duyAnhId] = ids
  const expense = (amount: number, payer: number, day: string) =>
    request.post(`${API}/api/households/${household.id}/expenses`, {
      data: { description: 'Tiền chợ', amount, payer_id: payer, spent_at: day, split: { type: 'equal', member_ids: ids } },
      headers: bearer(tien),
    })
  expect((await expense(300_000, tienId, `${lastMonth}-10`)).status()).toBe(201)
  expect((await expense(90_000, duyAnhId, today)).status()).toBe(201)
  // Only the receiver records a repayment (ACCOUNTS.md S2): Tiến records Minh's
  const repaid = await request.post(`${API}/api/households/${household.id}/settlements`, {
    data: { from_member_id: minhId, to_member_id: tienId, amount: 100_000, settled_at: `${lastMonth}-15` },
    headers: bearer(tien),
  })
  expect(repaid.status()).toBe(201)
  return { id: household.id as number, owner: tien as TestAccount }
}

test('the report opens from Tổng quan, ends on the balances and steps back a month', async ({ page, request }) => {
  const { id, owner } = await makeHousehold(request)
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signInPage(page, owner)
    await page.goto(`/households/${id}`)
    await page.getByRole('link', { name: 'Báo cáo tháng' }).click()
    await expect(page).toHaveURL(new RegExp(`/households/${id}/report/${thisMonth}$`))

    const table = page.getByRole('table')
    await expect(table).toBeVisible()
    await expect(page.getByText('Cả nhà chi')).toContainText('90.000đ')
    const balances = await (await request.get(`${API}/api/households/${id}/balances`, { headers: bearer(owner) })).json()
    const nets = (balances.balances as { net: number }[]).map((b) => signed(b.net))
    expect(nets).toEqual([signed(70_000), signed(-30_000), signed(-40_000)])
    const ends = await table.locator('tbody tr td:last-child').allTextContents()
    expect(ends, 'Cuối tháng equals the balances').toEqual(nets)
    const starts = await table.locator('tbody tr td:first-of-type').allTextContents()
    expect(starts).toEqual([signed(100_000), signed(0), signed(-100_000)])

    await page.getByRole('link', { name: /^Tháng trước/ }).click()
    await expect(page).toHaveURL(new RegExp(`/report/${lastMonth}$`))
    await expect(page.getByText('Cả nhà chi')).toContainText('300.000đ')
    // The first month: everyone starts at 0, and it ends where this month starts
    await expect(table.locator('tbody tr td:first-of-type')).toHaveText([signed(0), signed(0), signed(0)])
    await expect(table.locator('tbody tr td:last-child')).toHaveText(starts)
    await expect(page.getByRole('link', { name: /^Tháng trước/ })).toHaveCount(0)

    // The month's expenses, on Chi tiêu
    await page.getByRole('link', { name: 'Xem các khoản chi tháng này' }).click()
    await expect(page).toHaveURL(new RegExp(`/households/${id}/expenses$`))
    await expect(page.getByRole('heading', { level: 3, name: /cả nhà chi 300\.000đ/ })).toBeVisible()
  } finally {
    const response = await deleteHousehold(request, id, owner)
    expect(response.status(), 'test household deleted').toBe(204)
  }
})

test('someone who is not in the house gets the not-found page', async ({ page, request }) => {
  const { id, owner } = await makeHousehold(request)
  try {
    // An is in none of this house's people: a stranger to it
    await signInPage(page, shared('An'))
    await page.goto(`/households/${id}/report/${thisMonth}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Không tìm thấy nhà này' })).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
    await expect(page.getByText('Cả nhà chi')).toHaveCount(0)
  } finally {
    const response = await deleteHousehold(request, id, owner)
    expect(response.status(), 'test household deleted').toBe(204)
  }
})
