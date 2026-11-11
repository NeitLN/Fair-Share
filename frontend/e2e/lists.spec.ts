import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

import { addMember, API, bearer, deleteHousehold, shared, signInPage } from './accounts.js'
import type { TestAccount } from './accounts.js'

// US4 and US5 of spec 012: each house card says what is going on for you, and a long description or
// an emptied month does not lose its place. Own households through the API with the run's shared
// accounts (accounts.ts), always deleted at the end.

// These steps name things by their Vietnamese words, whatever the browser's language
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('fair-share:language', 'vi'))
})

async function createHousehold(request: APIRequestContext, owner: TestAccount, name: string) {
  const response = await request.post(`${API}/api/households`, {
    data: { name },
    headers: bearer(owner),
  })
  expect(response.status(), await response.text()).toBe(201)
  return (await response.json()) as { id: number; member_id: number }
}

async function addExpense(
  request: APIRequestContext,
  owner: TestAccount,
  householdId: number,
  body: Record<string, unknown>,
) {
  const response = await request.post(`${API}/api/households/${householdId}/expenses`, {
    data: body,
    headers: bearer(owner),
  })
  expect(response.status(), await response.text()).toBe(201)
}

/** Someone asks to join and is not approved: one thing waits for the owner. */
async function askToJoin(
  request: APIRequestContext,
  owner: TestAccount,
  householdId: number,
  account: TestAccount,
) {
  const invite = await (
    await request.get(`${API}/api/households/${householdId}/invite`, { headers: bearer(owner) })
  ).json()
  const joined = await request.post(`${API}/api/join`, {
    data: { code: invite.code },
    headers: bearer(account),
  })
  expect(joined.status(), await joined.text()).toBe(200)
}

test('each house card says what it has for you, in a grid on a laptop', async ({ page, request }) => {
  const minh = shared('Minh')
  const tien = shared('Tiến')
  const an = shared('An')
  const stamp = Date.now()
  const creditName = `E2E thẻ ${stamp}`
  const debtName = `E2E nợ ${stamp}`
  const made: number[] = []
  try {
    // Minh is owed 150.000đ here, and someone is waiting for his approval
    const credit = await createHousehold(request, minh, creditName)
    made.push(credit.id)
    const tienInCredit = await addMember(request, credit.id, minh, tien)
    await addExpense(request, minh, credit.id, {
      description: 'Tiền nhà',
      amount: 300_000,
      payer_id: credit.member_id,
      spent_at: '2026-10-26',
      split: { type: 'equal', member_ids: [credit.member_id, tienInCredit] },
    })
    await askToJoin(request, minh, credit.id, an)

    // Minh owes 100.000đ here
    const debt = await createHousehold(request, minh, debtName)
    made.push(debt.id)
    const tienInDebt = await addMember(request, debt.id, minh, tien)
    await addExpense(request, minh, debt.id, {
      description: 'Đi chợ',
      amount: 200_000,
      payer_id: tienInDebt,
      spent_at: '2026-10-26',
      split: { type: 'equal', member_ids: [debt.member_id, tienInDebt] },
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await signInPage(page, minh)
    await page.goto('/')

    const creditCard = page.getByRole('link', { name: new RegExp(creditName) })
    await expect(creditCard).toContainText('Bạn được nhận 150.000đ')
    await expect(creditCard.getByRole('status', { name: '1 việc đang chờ bạn' })).toBeVisible()
    const debtCard = page.getByRole('link', { name: new RegExp(debtName) })
    await expect(debtCard).toContainText('Bạn cần trả 100.000đ')

    // Houses are rows in one panel (specs/017): from 1024 px every amount ends on the same right edge,
    // and at 1440 Thêm nhà stands beside the list, not far across the screen
    for (const width of [1024, 1440]) {
      await page.setViewportSize({ width, height: 800 })
      // At least these two: the shared account may be in the houses of tests running beside this one
      await expect(page.locator('.house-rows .household-money').nth(1)).toBeVisible()
      const edges = await page
        .locator('.house-rows .household-money')
        .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)))
      expect(edges.length).toBeGreaterThanOrEqual(2)
      expect(Math.max(...edges) - Math.min(...edges), `amount edges at ${width} px`).toBeLessThanOrEqual(1)
    }
    const gap = await page.evaluate(() => {
      const list = document.querySelector('.house-rows')!.getBoundingClientRect()
      const add = document.querySelector('.ways-in')!.getBoundingClientRect()
      return add.left - list.right
    })
    expect(gap).toBeGreaterThanOrEqual(0)
    expect(gap).toBeLessThanOrEqual(48)

    // At 320 px nothing scrolls sideways and each card still opens its house
    await page.setViewportSize({ width: 320, height: 800 })
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(sideways).toBeLessThanOrEqual(1)
    await expect(creditCard).toBeVisible()
  } finally {
    for (const id of made.reverse()) {
      expect((await deleteHousehold(request, id, minh)).status(), 'household deleted').toBe(204)
    }
  }
})

test('a long description offers Xem đủ, and an emptied month keeps its filter', async ({ page, request }) => {
  const minh = shared('Minh')
  const tien = shared('Tiến')
  const name = `E2E chi ${Date.now()}`
  const description =
    'Tiền điện, nước, internet và phí chung cư tháng chín của cả nhà ở căn hộ quận bảy, tính luôn tiền rác'
  const house = await createHousehold(request, minh, name)
  try {
    const tienMember = await addMember(request, house.id, minh, tien)
    await addExpense(request, minh, house.id, {
      description,
      amount: 300_000,
      payer_id: house.member_id,
      spent_at: '2026-09-15',
      split: { type: 'equal', member_ids: [house.member_id, tienMember] },
    })

    await page.setViewportSize({ width: 360, height: 800 })
    await signInPage(page, minh)
    await page.goto(`/households/${house.id}/expenses`)

    // Two lines at most, the whole text in its title and a way to read it all
    const descriptionLine = page.locator('.expense-description').filter({ hasText: 'Tiền điện' })
    const text = descriptionLine.locator('.expense-description-text')
    await expect(descriptionLine).toHaveAttribute('title', description)
    expect(await text.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true)
    await page.getByRole('button', { name: 'Xem đủ' }).click()
    await expect(page.locator('.expense-description.expanded')).toContainText(description)
    await expect(page.getByRole('button', { name: 'Thu gọn' })).toBeVisible()

    // September keeps its filter when its last expense is deleted, and says it is empty
    const month = page.getByRole('combobox', { name: 'Tháng', exact: true })
    await month.selectOption({ label: '9/2026' })
    page.on('dialog', (dialog) => dialog.accept())
    await text.click()
    await page.getByRole('button', { name: `Xoá ${description}` }).click()

    await expect(page.getByText('Tháng 9/2026 chưa có khoản chi nào.')).toBeVisible()
    await expect(month).toHaveValue('2026-09')
    await page.getByRole('button', { name: 'Bỏ lọc' }).last().click()
    await expect(page.getByText('Tháng 9/2026 chưa có khoản chi nào.')).toHaveCount(0)
    await expect(page.getByText('Chưa có khoản chi nào. Ghi khoản đầu tiên ở trên.')).toBeVisible()
  } finally {
    expect((await deleteHousehold(request, house.id, minh)).status(), 'household deleted').toBe(204)
  }
})
