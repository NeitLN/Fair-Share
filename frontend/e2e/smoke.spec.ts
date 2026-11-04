import { expect, test } from '@playwright/test'

import { deleteHousehold } from './accounts.js'
import type { TestAccount } from './accounts.js'

// The main flow with two people, each in their own browser, against the live site by default
// (playwright.config.ts): sign up, create a household, join it with the invite code, the owner
// approves, an expense, and the person who received the money confirms it. It writes to the real
// database, so the household has an obvious name and is always deleted at the end, even when a step
// fails. It never uses AI Quick add (no Gemini quota spent).

// The steps name buttons by their Vietnamese words; English is the default, so pick Vietnamese first
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
})

test('two housemates, from signing up to everyone settled', async ({ page, browser, request }) => {
  const name = `E2E smoke ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  let householdId: number | null = null
  let owner: TestAccount | null = null
  const minhContext = await browser.newContext({ viewport: { width: 360, height: 800 } })
  await minhContext.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
  const minh = await minhContext.newPage()

  try {
    // 1. Tiến signs up in the page (the first load may wait for the free API instance to wake up)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập để vào nhà của bạn' })).toBeVisible()
    await page.getByRole('button', { name: 'Tạo tài khoản' }).first().click()
    const email = `e2e-${Date.now()}@fair-share.test`
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Tên của bạn').fill('Tiến')
    await page.getByLabel('Mật khẩu').fill('e2e-password-not-secret')
    await page.getByRole('button', { name: 'Tạo tài khoản' }).nth(1).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Nhà của bạn', exact: true })).toBeVisible({ timeout: 60_000 })
    owner = await page.evaluate(() => JSON.parse(localStorage.getItem('fair-share:session') ?? 'null'))

    // 2. He creates the household and lands on its members page, with its invite code. With no house
    //    yet, joining with a code is open and "+ Tạo nhà mới" waits folded under it
    await page.getByText('+ Tạo nhà mới').click()
    await page.getByLabel('Tên nhà').fill(name)
    await page.getByRole('button', { name: 'Tạo nhà' }).click()
    await page.waitForURL(/\/households\/\d+\/members$/, { timeout: 60_000 })
    householdId = Number(/\/households\/(\d+)\//.exec(page.url())?.[1])
    const code = (await page.locator('.invite-code').innerText()).replace('-', '')

    // 3. Minh signs up on his phone and opens the invite link: he asks to join, and sees nothing yet
    await minh.goto('/')
    await minh.getByRole('button', { name: 'Tạo tài khoản' }).first().click()
    await minh.getByLabel('Email').fill(`e2e-${Date.now()}-minh@fair-share.test`)
    await minh.getByLabel('Tên của bạn').fill('Minh')
    await minh.getByLabel('Mật khẩu').fill('e2e-password-not-secret')
    await minh.getByRole('button', { name: 'Tạo tài khoản' }).nth(1).click()
    await expect(minh.getByRole('heading', { level: 1, name: 'Nhà của bạn', exact: true })).toBeVisible()
    await minh.goto(`/join/${code}`)
    await minh.getByRole('button', { name: 'Gửi yêu cầu vào nhà' }).click()
    await expect(minh.getByRole('region', { name: 'Đang chờ duyệt' })).toBeVisible()

    // 4. Tiến approves him
    await page.reload()
    const asking = page.getByRole('region', { name: 'Người xin vào nhà' })
    await asking.getByRole('button', { name: 'Duyệt' }).click()
    await expect(page.getByText('Minh đã vào nhà.')).toBeVisible()

    // 5. Minh records 300.000đ he paid for both of them (payer defaults to him, split to everyone)
    await minh.goto(`/households/${householdId}/expenses`)
    await minh.getByLabel('Nội dung').fill('Lẩu E2E')
    await minh.getByLabel('Số tiền').fill('300k')
    await minh.getByRole('button', { name: 'Lưu khoản chi' }).click()
    // The toast "Đã lưu: Lẩu E2E 300.000đ" repeats it: the row is the exact text
    await expect(minh.getByText('Lẩu E2E', { exact: true })).toBeVisible()

    // 6. Tiến owes Minh 150.000đ: he can only tell Minh he sent it, and only Minh can say he received it
    //    (docs/ACCOUNTS.md S2, S3)
    await page.goto(`/households/${householdId}`)
    await expect(page.locator('.verdict-sentence')).toContainText('Bạn cần trả Minh')
    await expect(page.getByText('Chuyển cho Minh xong thì bấm để báo, Minh sẽ xác nhận.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tôi đã chuyển' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Đã nhận' })).toHaveCount(0)

    // 7. Minh confirms; Hoàn tác takes it back; he confirms again and the house is settled
    await minh.goto(`/households/${householdId}`)
    const transfers = minh.getByRole('list', { name: 'Các lần trả gợi ý' })
    await transfers.getByRole('button', { name: 'Đã nhận' }).click()
    await expect(minh.getByRole('status').filter({ hasText: 'Đã ghi' })).toBeVisible()
    await transfers.getByRole('button', { name: 'Hoàn tác' }).click()
    await transfers.getByRole('button', { name: 'Đã nhận' }).click()
    await expect(transfers.getByRole('button', { name: 'Hoàn tác' })).toHaveCount(1)
    await page.reload()
    await expect(page.locator('.verdict-sentence')).toContainText('Cả nhà sạch nợ')
  } finally {
    await minhContext.close()
    // Always remove the test household and everything in it from the real database
    if (householdId && owner) {
      const response = await deleteHousehold(request, householdId, owner)
      expect(response.status(), 'test household deleted').toBe(204)
    }
  }
})

test('signed out, a household address shows the sign-in form', async ({ page }) => {
  await page.goto('/households/1')
  await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập để vào nhà của bạn' })).toBeVisible({
    timeout: 60_000,
  })
})
