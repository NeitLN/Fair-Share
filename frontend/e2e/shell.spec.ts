import { expect, test } from '@playwright/test'

import { API, bearer, deleteHousehold, shared, signInPage } from './accounts.js'

// specs/011-first-impressions, PR-D, in a real browser: the notice for a slow answer, and quick add on a
// server with or without an AI key (the local stack has none, the live one has). Own household through
// the API, always deleted at the end.

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
})

const NOTICE = 'Phản hồi đang lâu hơn bình thường. Máy chủ có thể đang khởi động, thường mất khoảng 1 phút. Bạn không cần tải lại trang.'

// On the sign-in page, signed out
test('a slow answer shows the notice above the page, and it goes by itself', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  // Signing in answers after 7 s, as a sleeping server would
  await page.route('**/api/auth/login', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 7_000))
    await route.continue()
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập để vào nhà của bạn' })).toBeVisible({ timeout: 60_000 })
  await page.getByLabel('Email').fill(`e2e-${Date.now()}-nobody@fair-share.test`)
  await page.getByLabel('Mật khẩu', { exact: true }).fill('e2e-password-not-secret')
  await page.getByLabel('Mật khẩu', { exact: true }).press('Enter')
  const notice = page.getByText(NOTICE)
  await expect(notice).toBeVisible({ timeout: 6_500 })
  await expect(notice).toBeInViewport()
  // The answer (no such account) comes, the usual message shows and the notice goes
  await expect(page.getByText('Email hoặc mật khẩu chưa đúng.')).toBeVisible({ timeout: 30_000 })
  await expect(notice).toBeHidden()
})

test('quick add follows what the server says about its AI key', async ({ page, request }) => {
  const version = await (await request.get(`${API}/api/version`)).json()
  expect(typeof version.ai).toBe('boolean')
  const tien = shared('Tiến')
  const name = `E2E shell ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const household = await (await request.post(`${API}/api/households`, { data: { name }, headers: bearer(tien) })).json()
  try {
    await signInPage(page, tien)
    await page.goto(`/households/${household.id}/expenses`)
    await expect(page.getByLabel('Nội dung')).toBeVisible()
    const off = page.getByText('Gõ nhanh bằng AI chưa được bật trên máy chủ này.')
    if (version.ai) {
      await expect(page.getByLabel('Câu mô tả khoản chi')).toBeVisible()
      await expect(off).toHaveCount(0)
    } else {
      await expect(off).toBeVisible()
      await expect(page.getByLabel('Câu mô tả khoản chi')).toHaveCount(0)
    }
  } finally {
    const response = await deleteHousehold(request, household.id, tien)
    expect(response.status(), 'test household deleted').toBe(204)
  }
})
