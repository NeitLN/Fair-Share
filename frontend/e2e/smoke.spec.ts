import { expect, test } from '@playwright/test'

// The main flow on a real browser, against the live site by default (playwright.config.ts).
// It writes to the real database, so the household it creates has an obvious name and is always
// deleted at the end, even when a step fails. It never uses AI Quick add (no Gemini quota spent).

// The API is a different origin in production; locally (Compose) it is the web origin's /api.
const API = process.env.E2E_API_URL ?? 'https://fair-share-4bu9.onrender.com'

test('a household from creation to everyone settled', async ({ page, request }) => {
  const name = `E2E smoke ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  let householdId: number | null = null

  try {
    // 1. Create the household. The first load may wait for the free API instance to wake up.
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Nhà của bạn' })).toBeVisible()
    await page.getByText('+ Tạo nhà mới').click()
    await page.getByLabel('Tên nhà').fill(name)
    await page.getByRole('button', { name: 'Tạo nhà' }).click()
    await page.waitForURL(/\/households\/\d+\/members$/, { timeout: 60_000 })
    householdId = Number(/\/households\/(\d+)\//.exec(page.url())?.[1])

    // 2. Three members
    for (const member of ['Tiến', 'Minh', 'Duy Anh']) {
      await page.getByLabel('Tên thành viên').fill(member)
      await page.getByRole('button', { name: 'Thêm thành viên' }).click()
      await expect(page.getByRole('listitem').filter({ hasText: member }).first()).toBeVisible()
    }

    // 3. "Bạn là ai?": this device is Tiến
    await page.getByRole('button', { name: 'Chọn' }).click()
    await page.locator('[aria-labelledby="chooser-title"]').getByRole('button', { name: 'Tiến' }).click()
    await expect(page.getByText('Bạn là')).toContainText('Tiến')

    // 4. Tiến pays 300.000đ for the three of them (payer defaults to you, split to everyone)
    await page.getByRole('link', { name: 'Chi tiêu' }).click()
    await page.getByLabel('Nội dung').fill('Lẩu E2E')
    await page.getByLabel('Số tiền').fill('300k')
    await page.getByRole('button', { name: 'Lưu khoản chi' }).click()
    await expect(page.getByText('Lẩu E2E')).toBeVisible()

    // 5. Tổng quan: the others owe Tiến, two transfers to settle it
    await page.getByRole('link', { name: 'Tổng quan' }).click()
    const verdict = page.locator('.verdict-sentence')
    await expect(verdict).toContainText('Bạn được nhận từ')
    const transfers = page.getByRole('list', { name: 'Các lần trả gợi ý' })
    await expect(transfers.getByRole('button', { name: 'Đã trả' })).toHaveCount(2)

    // 6. Đã trả stamps one transfer; Hoàn tác takes it back
    await transfers.getByRole('button', { name: 'Đã trả' }).first().click()
    await expect(transfers.getByRole('button', { name: 'Hoàn tác' })).toHaveCount(1)
    await expect(page.getByRole('status').filter({ hasText: 'Đã ghi' })).toBeVisible()
    await transfers.getByRole('button', { name: 'Hoàn tác' }).click()
    await expect(transfers.getByRole('button', { name: 'Đã trả' })).toHaveCount(2)

    // 7. Pay both: the house is settled
    await transfers.getByRole('button', { name: 'Đã trả' }).first().click()
    await expect(transfers.getByRole('button', { name: 'Hoàn tác' })).toHaveCount(1)
    await transfers.getByRole('button', { name: 'Đã trả' }).click()
    await expect(verdict).toContainText('Cả nhà sạch nợ')
  } finally {
    // Always remove the test household and everything in it from the real database
    if (householdId) {
      const response = await request.delete(`${API}/api/households/${householdId}`)
      expect(response.status(), 'test household deleted').toBe(204)
    }
  }
})
