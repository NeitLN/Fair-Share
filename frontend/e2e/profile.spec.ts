import { expect, test } from '@playwright/test'

import { addMember, API, bearer, deleteHousehold, signInPage, signUp } from './accounts.js'

// The profile page (specs/010-profile-page): rename everywhere with a household kept back, and a
// password change that signs the other browser out. Builds its own households through the API and
// always deletes them.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
})

test('a new name reaches every household, and one where it is taken keeps the old one', async ({ page, request }) => {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const lan = await signUp(request, 'Lan')
  const owner = await signUp(request, 'Chủ B')
  const taken = await signUp(request, 'Ngọc Lan')
  const a = await (await request.post(`${API}/api/households`, { data: { name: `E2E A ${stamp}` }, headers: bearer(lan) })).json()
  const b = await (await request.post(`${API}/api/households`, { data: { name: `E2E B ${stamp}` }, headers: bearer(owner) })).json()
  try {
    await addMember(request, b.id, owner, lan)
    await addMember(request, b.id, owner, taken)
    await signInPage(page, lan)
    await page.goto('/')
    await page.getByLabel('Tài khoản: Lan').click()
    await page.getByRole('link', { name: 'Hồ sơ của bạn' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Hồ sơ của bạn' })).toBeVisible()

    const field = page.getByLabel('Tên hiển thị')
    await field.fill('Ngọc Lan')
    await page.getByRole('button', { name: 'Lưu' }).first().click()
    await expect(page.getByText(`Ở E2E B ${stamp} đã có người tên Ngọc Lan, nên ở đó bạn vẫn là Lan.`)).toBeVisible()
    await expect(page.getByLabel('Tài khoản: Ngọc Lan')).toBeVisible()

    const names = async (id: number, as: typeof lan) =>
      (await (await request.get(`${API}/api/households/${id}/members`, { headers: bearer(as) })).json()).map(
        (m: { name: string }) => m.name,
      )
    expect(await names(a.id, lan)).toEqual(['Ngọc Lan'])
    expect((await names(b.id, owner)).sort()).toEqual(['Chủ B', 'Lan', 'Ngọc Lan'])
  } finally {
    await deleteHousehold(request, a.id, lan)
    await deleteHousehold(request, b.id, owner)
  }
})

test('a new password keeps this browser signed in and signs the other one out', async ({ browser, request }) => {
  const minh = await signUp(request, 'Minh')
  const login = await request.post(`${API}/api/auth/login`, {
    data: { email: minh.user.email, password: 'e2e-password-not-secret' },
  })
  const laptop = await login.json()

  const phone = await browser.newPage()
  await phone.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
  await signInPage(phone, minh)
  await phone.goto('/account')
  await phone.getByLabel('Mật khẩu hiện tại').fill('e2e-password-not-secret')
  await phone.getByLabel('Mật khẩu mới').fill('e2e-new-password-1')
  await phone.getByRole('button', { name: 'Đổi mật khẩu' }).click()
  await expect(phone.getByText('Đã đổi mật khẩu. Các nơi khác đã đăng xuất.')).toBeVisible()

  const other = await browser.newPage()
  await other.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
  await signInPage(other, laptop)
  await other.goto('/')
  // Its next request is refused, so it is back on the sign-in form
  await expect(other.getByRole('textbox', { name: 'Mật khẩu', exact: true })).toBeVisible()

  await phone.goto('/')
  await expect(phone.getByLabel('Tài khoản: Minh')).toBeVisible()
  const old = await request.post(`${API}/api/auth/login`, { data: { email: minh.user.email, password: 'e2e-password-not-secret' } })
  expect(old.status()).toBe(401)
  const fresh = await request.post(`${API}/api/auth/login`, { data: { email: minh.user.email, password: 'e2e-new-password-1' } })
  expect(fresh.status()).toBe(200)
  await phone.close()
  await other.close()
})

test('a status is seen by a housemate on Thành viên, and gone once cleared', async ({ page, request }) => {
  const lan = await signUp(request, 'Lan')
  const minh = await signUp(request, 'Minh')
  const house = await (
    await request.post(`${API}/api/households`, { data: { name: `E2E status ${Date.now()}` }, headers: bearer(lan) })
  ).json()
  try {
    await addMember(request, house.id, lan, minh)
    const status = await request.put(`${API}/api/me/status`, { data: { status: 'đang ăn kiêng 🥗' }, headers: bearer(lan) })
    expect(status.status()).toBe(200)
    await signInPage(page, minh)
    await page.goto(`/households/${house.id}/members`)
    await expect(page.locator('.member-status')).toHaveText('đang ăn kiêng 🥗')
    await request.put(`${API}/api/me/status`, { data: { status: null }, headers: bearer(lan) })
    await page.reload()
    await expect(page.locator('.member-row').first()).toBeVisible()
    await expect(page.locator('.member-status')).toHaveCount(0)
  } finally {
    await deleteHousehold(request, house.id, lan)
  }
})
