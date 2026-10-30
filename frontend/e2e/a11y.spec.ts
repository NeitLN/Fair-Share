import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'

// DESIGN.md §8, checked in a real browser: headings, live regions, reduced motion, the keyboard
// (Tab, Enter, Escape), focus ring, 16 px inputs. Like smoke.spec.ts it builds its own household
// through the API and always deletes it; it never calls AI Quick add.

const API = process.env.E2E_API_URL ?? 'https://fair-share-4bu9.onrender.com'

test.use({ reducedMotion: 'reduce' })

// The checks name screens by their Vietnamese words; the English pages are checked in
// src/i18n/english.test.tsx. English is the default, so pick Vietnamese before each page loads.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
})

async function makeHousehold(request: APIRequestContext) {
  const name = `E2E a11y ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const household = await (await request.post(`${API}/api/households`, { data: { name } })).json()
  // Only the answer to creating it carries the household's key; every other call sends it (#132)
  const headers = { 'X-Household-Key': household.key as string }
  const ids: number[] = []
  for (const member of ['Tiến', 'Minh', 'Duy Anh']) {
    const created = await request.post(`${API}/api/households/${household.id}/members`, {
      data: { name: member },
      headers,
    })
    ids.push((await created.json()).id)
  }
  const today = new Date().toISOString().slice(0, 10)
  await request.post(`${API}/api/households/${household.id}/expenses`, {
    data: { description: 'Lẩu', amount: 300_000, payer_id: ids[0], spent_at: today, split: { type: 'equal', member_ids: ids } },
    headers,
  })
  return { id: household.id as number, key: household.key as string }
}

async function headingLevels(page: Page) {
  return page.$$eval('h1,h2,h3,h4,h5,h6', (hs) => hs.map((h) => Number(h.tagName[1])))
}

test('the household screens meet the accessibility checklist', async ({ page, request }) => {
  const { id, key } = await makeHousehold(request)
  try {
    // Open it once through its invite link, as a housemate would, so this browser holds the key
    await page.goto(`/households/${id}#k=${key}`)
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Cần đường dẫn mời')

    // One h1 per screen, first, and no level skipped
    for (const path of ['/', `/households/${id}`, `/households/${id}/expenses`, `/households/${id}/members`]) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const levels = await headingLevels(page)
      expect(levels[0], `first heading on ${path}`).toBe(1)
      expect(levels.filter((l) => l === 1), `one h1 on ${path}`).toHaveLength(1)
      expect(levels.every((l, i) => i === 0 || l <= levels[i - 1] + 1), `no skipped level on ${path}`).toBe(true)
      // Inputs are 16 px so phones do not zoom in
      const small = await page.$$eval<string[], HTMLElement>('input:not([type=checkbox]):not([type=radio]), select, textarea', (els) =>
        els.filter((e) => e.offsetParent !== null && parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.id),
      )
      expect(small, `inputs under 16 px on ${path}`).toEqual([])
    }

    // "Bạn là ai?": Escape closes the chooser and gives the focus back
    await page.goto(`/households/${id}`)
    const choose = page.getByRole('button', { name: 'Chọn' })
    await choose.click()
    await page.keyboard.press('Escape')
    await expect(page.locator('[aria-labelledby="chooser-title"]')).toHaveCount(0)
    await expect(choose).toBeFocused()
    await choose.click()
    await page.locator('[aria-labelledby="chooser-title"]').getByRole('button').first().click()

    // Đã trả: the stamp is text, the toast is a polite live region, and nothing moves
    await expect(page.locator('.toasts')).toHaveAttribute('aria-live', 'polite')
    const transfers = page.getByRole('list', { name: 'Các lần trả gợi ý' })
    await transfers.getByRole('button', { name: 'Đã trả' }).first().click()
    await expect(page.locator('.transfer-card.paid').first()).toContainText('ĐÃ TRẢ')
    await expect(page.locator('.toasts')).toContainText('Đã ghi')
    const moving = await page.$$eval('*', (els) =>
      els.filter((el) => {
        const cs = getComputedStyle(el)
        const animated = cs.animationName !== 'none' && parseFloat(cs.animationDuration) > 0.01
        const transitioned = cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0.01)
        return animated || transitioned
      }).map((el) => `${el.tagName}.${el.className}`),
    )
    expect(moving, 'animations left with reduced motion').toEqual([])

    // Escape closes "Ghi khoản trả khác" and focuses its summary
    const other = page.getByText('Ghi khoản trả khác').first()
    await other.click()
    await page.getByLabel('Người nhận').focus()
    await page.keyboard.press('Escape')
    await expect(page.getByLabel('Người nhận')).toBeHidden()
    await expect(other).toBeFocused()

    // Chi tiêu: Escape closes the date and split folds; Enter saves; focus is visible
    await page.goto(`/households/${id}/expenses`)
    for (const [opener, control] of [
      ['Đổi ngày', '#expense-date-control'],
      ['Sửa cách chia', '#expense-split-control'],
    ] as const) {
      const button = page.getByRole('button', { name: opener })
      await button.click()
      await expect(page.locator(control)).toBeVisible()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Escape')
      await expect(page.locator(control)).toBeHidden()
      await expect(page.getByRole('button', { name: opener })).toBeFocused()
    }
    const ring = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement as Element)
      return { outline: cs.outlineStyle, shadow: cs.boxShadow }
    })
    expect(ring.outline !== 'none' || ring.shadow !== 'none', 'keyboard focus is visible').toBe(true)

    await page.getByLabel('Nội dung').fill('Phím Enter')
    await page.getByLabel('Số tiền').fill('30k')
    await page.getByLabel('Số tiền').press('Enter')
    await expect(page.getByText('Phím Enter')).toBeVisible()

    // Households: Escape closes "+ Tạo nhà mới"
    await page.goto('/')
    const create = page.getByText('+ Tạo nhà mới')
    await create.click()
    await page.getByLabel('Tên nhà').focus()
    await page.keyboard.press('Escape')
    await expect(page.getByLabel('Tên nhà')).toBeHidden()
    await expect(create).toBeFocused()
  } finally {
    const response = await request.delete(`${API}/api/households/${id}`, {
      headers: { 'X-Household-Key': key },
    })
    expect(response.status(), 'test household deleted').toBe(204)
  }
})
