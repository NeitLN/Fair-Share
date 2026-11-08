import { expect, test } from '@playwright/test'

import { addMember, API, bearer, deleteHousehold, signInPage, signUp } from './accounts.js'

// The expense form on a phone (specs/011-first-impressions, PR-B): a refused save says why in the sticky
// save area and focuses the field, Tự chia starts at the equal split, and a very large amount asks once
// before it is saved. Own household and accounts through the API, always deleted at the end.

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
})

test('a refused save is seen on a phone, and a large amount asks first', async ({ page, request }) => {
  const name = `E2E form ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const tien = await signUp(request, 'Tiến')
  const minh = await signUp(request, 'Minh')
  const household = await (await request.post(`${API}/api/households`, { data: { name }, headers: bearer(tien) })).json()
  try {
    await addMember(request, household.id, tien, minh)
    await page.setViewportSize({ width: 360, height: 740 })
    await signInPage(page, tien)
    await page.goto(`/households/${household.id}/expenses`)

    await page.getByLabel('Nội dung').fill('Lẩu')
    await page.getByLabel('Số tiền').fill('300000')
    await page.getByRole('button', { name: 'Sửa cách chia' }).click()
    await page.getByRole('button', { name: 'Tự chia' }).click()

    // Tự chia starts at what Chia đều would give, each share with its value under it
    const tienShare = page.getByLabel(/^Phần của Tiến/)
    const minhShare = page.getByLabel(/^Phần của Minh/)
    await expect(tienShare).toHaveValue('150000')
    await expect(minhShare).toHaveValue('150000')
    await expect(page.locator('.share-preview').first()).toHaveText('= 150.000đ')

    // Shares that do not add up: the reason above the button, in view, and the first share focused
    await tienShare.fill('100000')
    await page.getByRole('button', { name: 'Lưu khoản chi' }).click()
    const summary = page.locator('.form-summary')
    await expect(summary).toHaveText('Chưa lưu được: Tổng các phần phải bằng đúng số tiền của khoản chi.')
    await expect(summary).toBeInViewport()
    await expect(tienShare).toBeFocused()

    // Fixing the shares clears it, and the save goes through
    await minhShare.fill('200000')
    await expect(summary).toBeHidden()
    await page.getByRole('button', { name: 'Lưu khoản chi' }).click()
    await expect(page.locator('.expense-days').getByText('Lẩu')).toBeVisible()
    // On the live site the list can show the row a moment before the form empties itself
    await expect(page.getByLabel('Nội dung')).toHaveValue('')

    // 60.000.000đ asks first, Sửa lại focused; Lưu thật saves it
    await page.getByLabel('Nội dung').fill('Máy lạnh')
    await page.getByLabel('Số tiền').fill('60000000')
    await page.getByRole('button', { name: 'Lưu khoản chi' }).click()
    await expect(page.getByText('Số tiền 60.000.000đ lớn bất thường. Lưu thật nhé?')).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Sửa lại' })).toBeFocused()
    await page.getByRole('button', { name: 'Lưu thật' }).click()
    await expect(page.locator('.expense-days').getByText('Máy lạnh')).toBeVisible()
  } finally {
    const response = await deleteHousehold(request, household.id, tien)
    expect(response.status(), 'test household deleted').toBe(204)
  }
})
