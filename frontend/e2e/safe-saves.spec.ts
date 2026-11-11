import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'

import { addMember, API, bearer, deleteHousehold, shared, signInPage } from './accounts.js'

// specs/018-safe-saves on a phone: a save says only what is known (offline, or no answer), nothing is sent
// behind the person's back, what is being saved cannot change underneath, and toasts never cover the
// save. Own household through the API, always deleted at the end.

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
})

async function house(request: APIRequestContext, label: string) {
  const name = `E2E ${label} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const tien = shared('Tiến')
  const household = await (await request.post(`${API}/api/households`, { data: { name }, headers: bearer(tien) })).json()
  await addMember(request, household.id, tien, shared('Minh'))
  return { id: household.id as number, tien }
}

async function openForm(page: Page, householdId: number) {
  await page.setViewportSize({ width: 360, height: 740 })
  await signInPage(page, shared('Tiến'))
  await page.goto(`/households/${householdId}/expenses`)
  await expect(page.getByLabel('Nội dung')).toBeVisible()
}

const isExpensePost = (url: string, method: string) => method === 'POST' && /\/api\/households\/\d+\/expenses$/.test(url)

test('offline: nothing is sent, now or later, and the form keeps what was typed', async ({ page, context, request }) => {
  const { id, tien } = await house(request, 'offline')
  try {
    await openForm(page, id)
    const posts: string[] = []
    page.on('request', (r) => {
      if (isExpensePost(r.url(), r.method())) posts.push(r.url())
    })
    await page.getByLabel('Nội dung').fill('Đi chợ')
    await page.getByLabel('Số tiền').fill('347,5k')
    await context.setOffline(true)
    const pressed = Date.now()
    await page.getByRole('button', { name: 'Lưu khoản chi' }).click()
    await expect(page.locator('.form-summary')).toHaveText(
      'Chưa lưu được: bạn đang mất mạng. Khoản chi này chưa được lưu.',
    )
    expect(Date.now() - pressed).toBeLessThan(3_000)
    await expect(page.getByLabel('Nội dung')).toHaveValue('Đi chợ')

    // Back online, and on another page: still nothing sent behind the person's back (FR-001)
    await context.setOffline(false)
    await page.waitForTimeout(5_000)
    await page.getByRole('link', { name: 'Tổng quan' }).click()
    await page.waitForTimeout(5_000)
    expect(posts).toEqual([])
  } finally {
    await deleteHousehold(request, id, tien)
  }
})

test('sent with no answer: the result is unknown, and the list catches up without a reload', async ({ page, request }) => {
  const { id, tien } = await house(request, 'no answer')
  try {
    await openForm(page, id)
    // The server records it, but its answer never reaches the page
    await page.route(/\/api\/households\/\d+\/expenses$/, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      await route.fetch()
      await route.abort('connectionreset')
    })
    await page.getByLabel('Nội dung').fill('Nước giặt')
    await page.getByLabel('Số tiền').fill('85k')
    await page.getByRole('button', { name: 'Lưu khoản chi' }).click()
    await expect(page.locator('.form-summary')).toHaveText(
      'Chưa nhận được kết quả. Có thể khoản chi đã được lưu, xem danh sách trước khi lưu lại.',
    )
    await expect(page.getByLabel('Nội dung')).toHaveValue('Nước giặt')
    // Read again on its own (0, 10, 30 s): the person sees it was saved before pressing again (SC-007)
    await expect(page.locator('.expense-days').getByText('Nước giặt')).toBeVisible({ timeout: 35_000 })
  } finally {
    await deleteHousehold(request, id, tien)
  }
})

test('a slow save: nothing typed during it changes what is saved, and the focus stays', async ({ page, request }) => {
  const { id, tien } = await house(request, 'slow')
  try {
    await openForm(page, id)
    await page.route(/\/api\/households\/\d+\/expenses$/, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      await new Promise((resolve) => setTimeout(resolve, 9_000))
      await route.continue()
    })
    await page.getByLabel('Nội dung').fill('Gas')
    await page.getByLabel('Số tiền').fill('380k')
    await page.getByRole('button', { name: 'Lưu khoản chi' }).click()

    const description = page.getByLabel('Nội dung')
    await expect(description).toHaveAttribute('readonly', '')
    await description.click()
    await page.keyboard.type(' tháng 11')
    await expect(description).toHaveValue('Gas')
    await expect(description).toBeFocused()

    await expect(page.locator('.expense-days').getByText('Gas', { exact: true })).toBeVisible({ timeout: 20_000 })
    const saved = await (await request.get(`${API}/api/households/${id}/expenses`, { headers: bearer(tien) })).json()
    expect(saved.map((e: { description: string }) => e.description)).toEqual(['Gas'])
  } finally {
    await deleteHousehold(request, id, tien)
  }
})

test('toasts at 360 px: one at a time, never over the save bar, never "saved" next to an error', async ({ page, request }) => {
  const { id, tien } = await house(request, 'toasts')
  try {
    await openForm(page, id)
    const check = async () => {
      const bar = await page.locator('.form-actions').boundingBox()
      const toasts = page.locator('.toast')
      const visible = []
      for (const toast of await toasts.all()) if (await toast.isVisible()) visible.push(toast)
      expect(visible.length).toBeLessThanOrEqual(1)
      // Never over the bar (FR-014): above it when it is stuck at the bottom, or anywhere it is not
      for (const toast of visible) {
        const box = await toast.boundingBox()
        if (box && bar) expect(box.y + box.height <= bar.y || box.y >= bar.y + bar.height).toBe(true)
      }
      if (await page.locator('.form-summary').isVisible()) {
        expect(await page.locator('.toast', { hasText: 'Đã lưu' }).count()).toBe(0)
      }
    }
    for (const [what, amount] of [
      ['Đi chợ', '120k'],
      ['Nước', '30k'],
    ]) {
      await page.getByLabel('Nội dung').fill(what)
      await page.getByLabel('Số tiền').fill(amount)
      await page.getByRole('button', { name: 'Lưu khoản chi' }).click()
      await expect(page.locator('.toast', { hasText: `Đã lưu: ${what}` })).toBeVisible()
      await check()
    }
    // A Tự chia that does not add up is refused: no "Đã lưu" stays beside it
    await page.getByLabel('Nội dung').fill('Lẩu')
    await page.getByLabel('Số tiền').fill('300000')
    await page.getByRole('button', { name: 'Sửa cách chia' }).click()
    await page.getByRole('button', { name: 'Tự chia' }).click()
    await page.getByLabel(/^Phần của Tiến/).fill('100000')
    await page.getByRole('button', { name: 'Lưu khoản chi' }).click()
    await expect(page.locator('.form-summary')).toBeVisible()
    await check()
  } finally {
    await deleteHousehold(request, id, tien)
  }
})

test('"Nhận số khác" offline stays open with the amount and says why inside it', async ({ page, context, request }) => {
  const tien = shared('Tiến')
  const minh = shared('Minh')
  const name = `E2E part offline ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const household = await (await request.post(`${API}/api/households`, { data: { name }, headers: bearer(tien) })).json()
  try {
    const minhId = await addMember(request, household.id, tien, minh)
    await request.post(`${API}/api/households/${household.id}/expenses`, {
      data: {
        description: 'Điện', amount: 200_000, payer_id: household.member_id, spent_at: new Date().toISOString().slice(0, 10),
        split: { type: 'equal', member_ids: [household.member_id, minhId] },
      },
      headers: bearer(tien),
    })
    await request.put(`${API}/api/households/${household.id}/notices`, {
      data: { to_member_id: household.member_id, amount: 100_000, version: null },
      headers: bearer(minh),
    })
    await page.setViewportSize({ width: 360, height: 740 })
    await signInPage(page, tien)
    await page.goto(`/households/${household.id}`)
    await page.getByRole('button', { name: 'Nhận số khác' }).click()
    const field = page.getByLabel('Số tiền đã nhận')
    await field.fill('60000')
    await context.setOffline(true)
    await page.getByRole('button', { name: 'Ghi số này' }).click()
    await expect(page.locator('.notice-step .field-problem')).toHaveText('Chưa ghi được: bạn đang mất mạng.')
    await expect(page.getByLabel('Số tiền đã nhận')).toHaveValue('60000')
    await context.setOffline(false)
  } finally {
    await deleteHousehold(request, household.id, tien)
  }
})
