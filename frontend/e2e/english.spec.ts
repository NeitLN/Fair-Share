import { expect, test } from '@playwright/test'

import { addMember, API, bearer, deleteHousehold, signInPage, signUp } from './accounts.js'

// The English UI, the default since #161 (#185): the other specs switch to Vietnamese first, so this
// one never sets a language. Like them it builds its own group through the API and always deletes it;
// it never calls AI Quick add.

test('a first visit is in English, and VI switches the page for good', async ({ page, request }) => {
  const tien = await signUp(request, 'Tiến')
  const minh = await signUp(request, 'Minh')
  const name = `E2E english ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const created = await request.post(`${API}/api/households`, { data: { name }, headers: bearer(tien) })
  const householdId: number = (await created.json()).id
  try {
    const minhId = await addMember(request, householdId, tien, minh)
    const mine = await (await request.get(`${API}/api/households`, { headers: bearer(tien) })).json()
    const tienId: number = mine.households.find((h: { id: number }) => h.id === householdId).member_id
    // Minh paid 240,000 for both of them, so Tiến owes Minh 120,000
    await request.post(`${API}/api/households/${householdId}/expenses`, {
      headers: bearer(tien),
      data: {
        description: 'Hotpot',
        amount: 240_000,
        payer_id: minhId,
        spent_at: new Date().toISOString().slice(0, 10),
        split: { type: 'equal', member_ids: [tienId, minhId] },
      },
    })

    await signInPage(page, tien)
    await page.goto(`/households/${householdId}`)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page).toHaveTitle(/See who owes who/)
    await expect(page.getByRole('heading', { name: 'You owe Minh' })).toBeVisible({ timeout: 60_000 })
    // English money: digits grouped by commas, a no-break space, then ₫
    await expect(page.getByText(/120,000\s₫/).first()).toBeVisible()

    // VI switches the whole page, and the choice survives a reload. Signed in, the switch is in the
    // account menu
    await page.getByLabel('Account: Tiến').click()
    await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'VI' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi')
    await expect(page.getByRole('heading', { name: 'Bạn cần trả Minh' })).toBeVisible()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi')
    await expect(page).toHaveTitle(/Rõ ai trả ai/)
    await expect(page.getByText(/120\.000đ/).first()).toBeVisible()
  } finally {
    const response = await deleteHousehold(request, householdId, tien)
    expect(response.status(), 'test group deleted').toBe(204)
  }
})
