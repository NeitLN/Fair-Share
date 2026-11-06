import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'

import { addMember, API, bearer, deleteHousehold, signInPage, signUp } from './accounts.js'
import type { TestAccount } from './accounts.js'

// DESIGN.md §8, checked in a real browser: headings, live regions, reduced motion, the keyboard
// (Tab, Enter, Escape), focus ring, 16 px inputs. Like smoke.spec.ts it builds its own household
// through the API with its own accounts and always deletes it; it never calls AI Quick add.

test.use({ reducedMotion: 'reduce' })

// The checks name screens by their Vietnamese words; the English pages are checked in
// src/i18n/english.test.tsx. English is the default, so pick Vietnamese before each page loads.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
})

/** Tiến owns it; Minh and Duy Anh joined; Tiến paid 300.000đ for the three: both owe him. */
async function makeHousehold(request: APIRequestContext) {
  const name = `E2E a11y ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const tien = await signUp(request, 'Tiến')
  const household = await (
    await request.post(`${API}/api/households`, { data: { name }, headers: bearer(tien) })
  ).json()
  const ids = [household.member_id as number]
  const minh = await signUp(request, 'Minh')
  ids.push(await addMember(request, household.id, tien, minh))
  ids.push(await addMember(request, household.id, tien, await signUp(request, 'Duy Anh')))
  const today = new Date().toISOString().slice(0, 10)
  await request.post(`${API}/api/households/${household.id}/expenses`, {
    data: { description: 'Lẩu', amount: 300_000, payer_id: ids[0], spent_at: today, split: { type: 'equal', member_ids: ids } },
    headers: bearer(tien),
  })
  return { id: household.id as number, owner: tien as TestAccount, minh: minh as TestAccount, ids }
}

async function headingLevels(page: Page) {
  return page.$$eval('h1,h2,h3,h4,h5,h6', (hs) => hs.map((h) => Number(h.tagName[1])))
}

test('the household screens meet the accessibility checklist', async ({ page, request }) => {
  const { id, owner, minh, ids } = await makeHousehold(request)
  try {
    // Signed in as Tiến, the owner, who is owed by the others
    await signInPage(page, owner)
    await page.goto(`/households/${id}`)
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Không tìm thấy nhà này')

    // One h1 per screen, first, and no level skipped
    for (const path of [
      '/',
      `/households/${id}`,
      `/households/${id}/expenses`,
      `/households/${id}/members`,
      `/households/${id}/report`,
    ]) {
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

    // Verdict B (specs/003-desktop-redesign): the transfers sit in their own panel under the taro block,
    // every button in it at least 44 px
    await page.goto(`/households/${id}`)
    const panel = page.locator('.verdict + .transfers-panel')
    await expect(panel.getByRole('list', { name: 'Các lần trả gợi ý' })).toBeVisible()
    const smallInPanel = await panel.locator('button').evaluateAll((els) =>
      els.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.textContent),
    )
    expect(smallInPanel, 'transfers panel buttons under 44 px').toEqual([])

    // Vì sao ra số này? (specs/002-balance-explanation): opens in place with every control at least 44 px,
    // no sideways scroll at 360 px, and Escape folds the line, then the explanation, back to its link
    await page.goto(`/households/${id}`)
    const why = page.getByText('Vì sao ra số này?')
    await why.click()
    const mine = page.getByRole('group', { name: 'Số dư của bạn' })
    await expect(mine).toBeVisible()
    await mine.getByText('Bạn đã chi cho cả nhà').click()
    await expect(mine.getByRole('list', { name: 'Bạn đã chi cho cả nhà' })).toBeVisible()
    const tooSmall = await mine.locator('summary, a').evaluateAll((els) =>
      els.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.textContent),
    )
    expect(tooSmall, 'explanation controls under 44 px').toEqual([])
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(sideways, 'sideways scroll with the explanation open').toBe(false)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(mine).toBeHidden()
    await expect(why).toBeFocused()

    // Báo cáo tháng (specs/004-monthly-report): cards on a phone, no sideways scroll at 360 or 320 px,
    // every link at least 44 px; on a computer a table with a header per column
    await page.goto(`/households/${id}/report`)
    for (const width of [360, 320]) {
      await page.setViewportSize({ width, height: 800 })
      await expect(page.getByText('Cả nhà chi')).toBeVisible()
      await expect(page.locator('.report-card')).toHaveCount(3)
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(wide, `sideways scroll on the report at ${width} px`).toBe(false)
      const smallLinks = await page.locator('.report a').evaluateAll((els) =>
        els.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.textContent),
      )
      expect(smallLinks, `report links under 44 px at ${width} px`).toEqual([])
    }
    // Chi theo danh mục (specs/005-expense-categories): every line at least 44 px, its bar hidden
    const chartLinks = page.locator('.category-chart a')
    await expect(chartLinks).toHaveCount(1)
    expect(await chartLinks.evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).length)).toBe(0)
    await expect(page.locator('.category-track').first()).toHaveAttribute('aria-hidden', 'true')
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.getByRole('table').getByRole('columnheader')).toHaveCount(7)
    await page.setViewportSize({ width: 360, height: 800 })

    // Đã nhận: the stamp is text, the toast is a polite live region, and nothing moves
    await page.goto(`/households/${id}`)
    await expect(page.locator('.toasts')).toHaveAttribute('aria-live', 'polite')
    const transfers = page.getByRole('list', { name: 'Các lần trả gợi ý' })
    await transfers.getByRole('button', { name: /^Xác nhận đã nhận/ }).first().click()
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
    // "Người nhận" is fixed to you (only the receiver records a repayment), so start from "Người trả"
    await page.getByLabel('Người trả').focus()
    await page.keyboard.press('Escape')
    await expect(page.getByLabel('Người trả')).toBeHidden()
    await expect(other).toBeFocused()

    // Chi tiêu: the category fold's chips are at least 44 px and fit 320 px without sideways scroll
    await page.goto(`/households/${id}/expenses`)
    await page.setViewportSize({ width: 320, height: 800 })
    await page.getByRole('button', { name: /^Đổi danh mục/ }).click()
    const chips = page.locator('#expense-category-control button')
    await expect(chips).toHaveCount(7)
    expect(await chips.evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).length)).toBe(0)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
      'sideways scroll with the categories open at 320 px',
    ).toBe(false)
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 360, height: 800 })

    // Chi tiêu: Escape closes the date, category and split folds; Enter saves; focus is visible
    for (const [opener, control] of [
      ['Đổi ngày', '#expense-date-control'],
      ['Đổi danh mục, đang là Khác', '#expense-category-control'],
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
    // The toast "Đã lưu: Phím Enter 30.000đ" repeats it: the row is the exact text
    await expect(page.getByText('Phím Enter', { exact: true })).toBeVisible()

    // Mới ghi (specs/006-recently-added): Minh records one; on Tiến's Tổng quan at 1440 × 900 the strip and
    // the Báo cáo tháng link are both in the first screen; at 360 and 320 px nothing scrolls sideways and
    // every control in the strip is at least 44 px
    await request.post(`${API}/api/households/${id}/expenses`, {
      data: { description: 'Nước rửa chén', amount: 30_000, payer_id: ids[1], spent_at: new Date().toISOString().slice(0, 10), split: { type: 'equal', member_ids: ids } },
      headers: bearer(minh),
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/households/${id}`)
    const strip = page.getByRole('region', { name: 'Mới ghi' })
    await expect(strip.getByRole('heading', { name: 'Mới ghi' })).toBeInViewport()
    await expect(strip.getByRole('link').first()).toBeInViewport()
    await expect(page.getByRole('link', { name: 'Báo cáo tháng' })).toBeInViewport()
    for (const width of [360, 320]) {
      await page.setViewportSize({ width, height: 800 })
      await expect(strip).toBeVisible()
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(wide, `sideways scroll with Mới ghi at ${width} px`).toBe(false)
      const small = await strip.locator('a, button').evaluateAll((els) =>
        els.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.textContent),
      )
      expect(small, `Mới ghi controls under 44 px at ${width} px`).toEqual([])
    }
    await page.setViewportSize({ width: 360, height: 800 })

    // Tới hạn (specs/007-recurring-expenses): an item due today under the transfers; at 360 and 320 px
    // nothing scrolls sideways and its controls are at least 44 px; at 1440 × 900 Báo cáo tháng stays
    // in the first screen
    const made = await request.post(`${API}/api/households/${id}/expenses`, {
      data: { description: 'Internet', amount: 300_000, payer_id: ids[1], spent_at: new Date().toISOString().slice(0, 10),
        split: { type: 'equal', member_ids: ids }, recurring: { varying_amount: false } },
      headers: bearer(minh),
    })
    await request.delete(`${API}/api/expenses/${(await made.json()).id}`, { headers: bearer(minh) })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/households/${id}`)
    const due = page.getByRole('region', { name: 'Tới hạn' })
    await expect(due).toBeVisible()
    await expect(page.getByRole('link', { name: 'Báo cáo tháng' })).toBeInViewport()
    for (const width of [360, 320]) {
      await page.setViewportSize({ width, height: 800 })
      await expect(due).toBeVisible()
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(wide, `sideways scroll with Tới hạn at ${width} px`).toBe(false)
      const small = await due.locator('a, button').evaluateAll((els) =>
        els.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.textContent),
      )
      expect(small, `Tới hạn controls under 44 px at ${width} px`).toEqual([])
    }
    await page.setViewportSize({ width: 360, height: 800 })

    // Households: Escape closes "+ Tạo nhà mới"
    await page.goto('/')
    const create = page.getByText('+ Tạo nhà mới')
    await create.click()
    await page.getByLabel('Tên nhà').focus()
    await page.keyboard.press('Escape')
    await expect(page.getByLabel('Tên nhà')).toBeHidden()
    await expect(create).toBeFocused()
  } finally {
    const response = await deleteHousehold(request, id, owner)
    expect(response.status(), 'test household deleted').toBe(204)
  }
})

// specs/008-wider-desktop-signin: signed out on a laptop, one centred block (brand, then the form and its
// switches); every control 44 px, no sideways scroll, the keyboard in the order seen. A phone is unchanged.
test('the sign-in page on a laptop and on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập để vào nhà của bạn' })).toBeVisible()
  await expect(page.locator('header.app-header')).toHaveCount(0)
  await expect(page.locator('.auth-intro')).toContainText('Rõ ai trả ai.')

  const small = await page.locator('main button, main input').evaluateAll((els) =>
    els
      .filter((e) => {
        const r = e.getBoundingClientRect()
        return r.height < 44 || r.width < 44
      })
      .map((e) => e.outerHTML.slice(0, 60)),
  )
  expect(small, 'sign-in controls under 44 px').toEqual([])
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(sideways, 'sideways scroll on sign-in at 1366 px').toBe(false)
  // Centred a little above the middle (5 % of the height, 38 px at 768): the optical centre
  const above = await page.locator('.auth-layout').evaluate((el) => {
    const r = el.getBoundingClientRect()
    return window.innerHeight / 2 - (r.top + r.height / 2)
  })
  expect(above, 'sign-in block above the middle').toBeGreaterThanOrEqual(20)
  expect(above, 'sign-in block above the middle').toBeLessThanOrEqual(60)

  // Tab from the top: the two tabs, the fields with Hiện, submit, then the language and the theme
  const order: string[] = []
  for (let i = 0; i < 11; i++) {
    await page.keyboard.press('Tab')
    order.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        return el.id || el.textContent?.trim() || el.tagName
      }),
    )
  }
  expect(order).toEqual(['Đăng nhập', 'Tạo tài khoản', 'auth-email', 'auth-password', 'Hiện', 'Đăng nhập', 'EN', 'VI', 'Tự động', 'Sáng', 'Tối'])

  // A phone: the page as before, with the header's wordmark and no brand block
  await page.setViewportSize({ width: 360, height: 800 })
  await expect(page.locator('header.app-header')).toHaveCount(1)
  await expect(page.locator('.auth-intro')).toHaveCount(0)
  const narrow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(narrow, 'sideways scroll on sign-in at 360 px').toBe(false)
})
