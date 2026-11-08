import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

import { API, bearer, deleteHousehold, shared, signInPage } from './accounts.js'

// Joining a house with its invite (specs/015-invite-preview): the link names the house and its owner
// before asking, the waiting card names them too, an approval shows the house without a reload, and a
// refusal leaves a line until "Đã hiểu". Shared accounts, own houses, deleted at the end.

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
})

async function newHouse(request: APIRequestContext, label: string) {
  const tien = shared('Tiến')
  const name = `E2E ${label} ${new Date().toISOString().slice(11, 16)}`
  const household = await (await request.post(`${API}/api/households`, { data: { name }, headers: bearer(tien) })).json()
  const invite = await (await request.get(`${API}/api/households/${household.id}/invite`, { headers: bearer(tien) })).json()
  return { id: household.id as number, name, code: (invite.code as string).replace('-', '') }
}

test('the invite names the house, and an approval shows it without a reload', async ({ page, request }) => {
  const tien = shared('Tiến')
  const an = shared('An')
  const house = await newHouse(request, 'invite')
  try {
    await page.setViewportSize({ width: 360, height: 800 })
    await signInPage(page, an)
    await page.goto(`/join/${house.code}`)
    await expect(page.getByText(`Lời mời vào ${house.name} của Tiến`)).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Gửi yêu cầu vào nhà' }).click()
    await expect(page.getByText(new RegExp(`^Bạn đang xin vào ${house.name} của Tiến · gửi ngày`))).toBeVisible()

    // Tiến approves on his own phone; An's page finds out by itself within about 10 seconds
    const approved = await request.post(`${API}/api/households/${house.id}/requests/${an.user.id}/approve`, {
      data: {},
      headers: bearer(tien),
    })
    expect(approved.status(), await approved.text()).toBe(200)
    await expect(page.getByText(`Bạn đã vào ${house.name}.`)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('link', { name: new RegExp(`^${house.name}`) })).toBeVisible()
  } finally {
    await deleteHousehold(request, house.id, tien)
  }
})

test('a refusal stays as a line until "Đã hiểu"', async ({ page, request }) => {
  const tien = shared('Tiến')
  const minh = shared('Minh')
  const house = await newHouse(request, 'refuse')
  try {
    const asked = await request.post(`${API}/api/join`, { data: { code: house.code }, headers: bearer(minh) })
    expect(asked.status(), await asked.text()).toBe(200)
    const refused = await request.post(`${API}/api/households/${house.id}/requests/${minh.user.id}/reject`, {
      headers: bearer(tien),
    })
    expect(refused.ok(), await refused.text()).toBe(true)

    await signInPage(page, minh)
    await page.goto('/')
    const line = page.getByText(`Tiến không duyệt yêu cầu vào ${house.name} của bạn.`)
    await expect(line).toBeVisible({ timeout: 30_000 })
    await page.getByRole('region', { name: 'Yêu cầu đã dừng' }).getByRole('button', { name: 'Đã hiểu' }).click()
    await expect(line).toBeHidden()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Nhà của bạn', exact: true })).toBeVisible()
    await expect(line).toBeHidden()
  } finally {
    await deleteHousehold(request, house.id, tien)
  }
})
