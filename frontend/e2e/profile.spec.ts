import { fileURLToPath } from 'node:url'

import { expect, test, type Page } from '@playwright/test'

import { addMember, API, bearer, deleteHousehold, shared, signInPage, signUp } from './accounts.js'

// The profile page (specs/010-profile-page): rename everywhere with a household kept back, and a
// password change that signs the other browser out. Builds its own households through the API and
// always deletes them. The account whose profile changes is the test's own; the housemate who only
// looks is a shared one (e2e/global-setup.ts).

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
})

// A part's save, found inside that part (specs/017, FR-028): "Lưu" today and "Lưu tên" later both
// match, and moving the parts around cannot make this run press another part's button
const saveIn = (page: Page, part: string) =>
  page.getByRole('region', { name: part }).getByRole('button', { name: /^Lưu/ })

test('a new name reaches every household, and one where it is taken keeps the old one', async ({ page, request }) => {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const lan = await signUp(request, 'Lan')
  const owner = shared('Duy Anh')
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
    await saveIn(page, 'Tên của bạn').click()
    await expect(page.getByText(`Ở E2E B ${stamp} đã có người tên Ngọc Lan, nên ở đó bạn vẫn là Lan.`)).toBeVisible()
    await expect(page.getByLabel('Tài khoản: Ngọc Lan')).toBeVisible()

    const names = async (id: number, as: typeof lan) =>
      (await (await request.get(`${API}/api/households/${id}/members`, { headers: bearer(as) })).json()).map(
        (m: { name: string }) => m.name,
      )
    expect(await names(a.id, lan)).toEqual(['Ngọc Lan'])
    expect((await names(b.id, owner)).sort()).toEqual(['Duy Anh', 'Lan', 'Ngọc Lan'])
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
  // The slowest answer in this file: argon2id twice (the old password checked, the new one hashed) and
  // every other session ended, on the free instance. A live run failed once on one of this test's waits
  // (12/11, log lost) and passed on retry; this one is the likely one, so it gets 30 s like invite.spec
  await expect(phone.getByText('Đã đổi mật khẩu. Các nơi khác đã đăng xuất.')).toBeVisible({ timeout: 30_000 })

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
  const minh = shared('Minh')
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

test('a gender chosen after reading the notice is seen by a housemate, and Không nêu removes it', async ({
  browser,
  request,
}) => {
  const lan = await signUp(request, 'Lan')
  const minh = shared('Minh')
  const house = await (
    await request.post(`${API}/api/households`, { data: { name: `E2E gender ${Date.now()}` }, headers: bearer(lan) })
  ).json()
  try {
    await addMember(request, house.id, lan, minh)
    const mine = await browser.newPage()
    await mine.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
    await signInPage(mine, lan)
    await mine.goto('/account')
    await expect(mine.getByText(/^Không bắt buộc, để bạn cùng nhà biết giới tính/)).toBeVisible()
    await mine.getByRole('radio', { name: 'Nữ' }).check()
    await saveIn(mine, 'Giới tính').click()
    await expect(mine.getByText('Đã lưu giới tính.')).toBeVisible()

    const theirs = await browser.newPage()
    await theirs.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
    await signInPage(theirs, minh)
    await theirs.goto(`/households/${house.id}/members`)
    await expect(theirs.locator('.member-gender')).toHaveText('Nữ')

    await mine.getByRole('radio', { name: 'Không nêu' }).check()
    await saveIn(mine, 'Giới tính').click()
    await expect(mine.getByText('Đã xoá giới tính.')).toBeVisible()
    await theirs.reload()
    await expect(theirs.locator('.member-row').first()).toBeVisible()
    await expect(theirs.locator('.member-gender')).toHaveCount(0)
    await mine.close()
    await theirs.close()
  } finally {
    await deleteHousehold(request, house.id, lan)
  }
})

test('a photo uploaded on the profile page shows to a housemate, and the initial is back once removed', async ({
  browser,
  request,
}) => {
  const lan = await signUp(request, 'Lan')
  const minh = shared('Minh')
  const house = await (
    await request.post(`${API}/api/households`, { data: { name: `E2E photo ${Date.now()}` }, headers: bearer(lan) })
  ).json()
  try {
    await addMember(request, house.id, lan, minh)

    const mine = await browser.newPage()
    await mine.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
    await signInPage(mine, lan)
    await mine.goto('/account')
    await mine.locator('#profile-photo-file').setInputFiles(fileURLToPath(new URL('./fixtures/photo.jpg', import.meta.url)))
    await expect(mine.getByText('Ảnh sẽ trông như thế này. Lưu để dùng, hoặc Huỷ.')).toBeVisible()
    await saveIn(mine, 'Bạn cùng nhà thấy bạn thế này').click()
    await expect(mine.getByText('Đã lưu ảnh đại diện.')).toBeVisible()

    // The server kept its own clean 256 × 256 copy, not the 800 × 600 file with its camera data
    const stored = await (await request.get(`${API}/api/me/photo`, { headers: bearer(lan) })).json()
    const bytes = Buffer.from(stored.data.split(',')[1], 'base64')
    expect(bytes.includes(Buffer.from('FixtureCam'))).toBe(false)

    const theirs = await browser.newPage()
    await theirs.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
    await signInPage(theirs, minh)
    const batches: string[] = []
    theirs.on('request', (r) => {
      if (r.url().endsWith(`/api/households/${house.id}/photos`)) batches.push(r.url())
    })
    await theirs.goto(`/households/${house.id}/members`)
    await expect(theirs.locator('.member-row img[src^="data:image/jpeg"]')).toHaveCount(1)
    await expect(theirs.locator('.house-head .avatar img')).toHaveCount(1) // the header stack too
    expect(batches).toHaveLength(1)
    // The photo is a data: URL, and it really drew: an img the Content-Security-Policy blocks is still
    // counted above but stays empty, so img-src must allow data: (G3-05)
    const drawn = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0
    await expect.poll(() => theirs.locator('.member-row img').evaluate(drawn)).toBe(true)
    const header = mine.locator('.account-menu > summary .avatar img')
    await expect(header).toHaveAttribute('src', /^data:image\//)
    await expect.poll(() => header.evaluate(drawn)).toBe(true)

    await mine.getByRole('button', { name: 'Gỡ ảnh' }).click()
    // Asked in place (plan item 8): the same words act in the question
    await mine.locator('.inline-confirm').getByRole('button', { name: 'Gỡ ảnh' }).click()
    await expect(mine.getByText('Đã gỡ ảnh. Avatar của bạn về lại chữ cái đầu.')).toBeVisible()
    await theirs.reload()
    await expect(theirs.locator('.member-row').first()).toBeVisible()
    await expect(theirs.locator('.member-row img')).toHaveCount(0)
    await mine.close()
    await theirs.close()
  } finally {
    await deleteHousehold(request, house.id, lan)
  }
})
