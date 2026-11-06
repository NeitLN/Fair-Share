import { expect, test } from '@playwright/test'

import { addMember, API, bearer, deleteHousehold, signInPage, signUp } from './accounts.js'

// Danh mục (specs/005-expense-categories) in a real browser: the form guesses a category from the
// description with no extra press, the list shows it, the monthly report's chart adds up to the month
// and opens Chi tiêu filtered. Own household and accounts through the API, always deleted at the end.

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
})

const pad = (n: number) => String(n).padStart(2, '0')
const now = new Date()
const thisMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
const today = `${thisMonth}-${pad(now.getDate())}`
const vnd = (amount: number) => `${amount.toLocaleString('vi-VN')}đ`

test('a guessed category, saved, listed and charted in the monthly report', async ({ page, request }) => {
  const name = `E2E categories ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const tien = await signUp(request, 'Tiến')
  const household = await (await request.post(`${API}/api/households`, { data: { name }, headers: bearer(tien) })).json()
  const id = household.id as number
  try {
    const ids = [household.member_id as number, await addMember(request, id, tien, await signUp(request, 'Minh'))]
    // Rent through the API, with its category
    const rent = await request.post(`${API}/api/households/${id}/expenses`, {
      data: { description: 'Tiền phòng', amount: 3_000_000, payer_id: ids[1], spent_at: today, category: 'rent', split: { type: 'equal', member_ids: ids } },
      headers: bearer(tien),
    })
    expect(rent.status()).toBe(201)

    await page.setViewportSize({ width: 1440, height: 900 })
    await signInPage(page, tien)
    await page.goto(`/households/${id}/expenses`)

    // Description, amount, Lưu: the category is already there
    await page.getByLabel('Nội dung').fill('Tiền điện tháng này')
    await expect(page.getByRole('button', { name: 'Đổi danh mục, đang là Điện nước' })).toBeVisible()
    await page.getByLabel('Số tiền').fill('450000')
    // The payer defaults to you once the house has loaded; on the free tier that can come after the
    // typing, and the form rightly asks "Chọn người trả" instead of guessing (live run of #204)
    await expect(page.getByRole('radio', { name: /^Tiến/ })).toBeChecked()
    await page.getByRole('button', { name: 'Lưu khoản chi' }).click()
    const row = page.getByRole('row', { name: /Tiền điện tháng này/ })
    await expect(row).toContainText('Điện nước')

    // The API stored it
    const listed = await (await request.get(`${API}/api/households/${id}/expenses`, { headers: bearer(tien) })).json()
    expect((listed as { description: string; category: string }[]).map((e) => [e.description, e.category]).sort()).toEqual([
      ['Tiền phòng', 'rent'],
      ['Tiền điện tháng này', 'utilities'],
    ])

    // The report's chart: biggest first, adding up to Cả nhà chi
    await page.goto(`/households/${id}/report/${thisMonth}`)
    await expect(page.getByText('Cả nhà chi')).toContainText(vnd(3_450_000))
    const chart = page.locator('.category-chart')
    await expect(chart.getByRole('link')).toHaveCount(2)
    const labels = await chart.getByRole('link').evaluateAll((links) => links.map((l) => l.getAttribute('aria-label')))
    expect(labels).toEqual([`Tiền nhà: ${vnd(3_000_000)}, 87% cả tháng`, `Điện nước: ${vnd(450_000)}, 13% cả tháng`])

    // A line opens Chi tiêu filtered to that month and category
    await chart.getByRole('link', { name: /^Điện nước/ }).click()
    await expect(page).toHaveURL(new RegExp(`/households/${id}/expenses$`))
    await expect(page.locator('#filter-category')).toHaveValue('utilities')
    await expect(page.getByRole('row', { name: /Tiền điện tháng này/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /Tiền phòng/ })).toHaveCount(0)
  } finally {
    const response = await deleteHousehold(request, id, tien)
    expect(response.status(), 'test household deleted').toBe(204)
  }
})
