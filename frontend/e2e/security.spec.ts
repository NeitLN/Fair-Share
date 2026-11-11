import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { addMember, API, bearer, deleteHousehold, shared, signInPage } from './accounts.js'

// G3-05: the web app's security headers, and a Content-Security-Policy that blocks nothing the app
// needs. On the live site the headers come from the Render dashboard (docs/ARCHITECTURE.md §1,
// "Security headers"); on a local stack from frontend/security-headers.conf.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('fair-share:language', 'vi')
    // Every blocked load or script, as the browser reports it to the page
    const seen: string[] = []
    ;(window as unknown as { cspViolations: string[] }).cspViolations = seen
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.effectiveDirective} blocked ${event.blockedURI || 'inline'} on ${location.pathname}`)
    })
  })
})

const violations = (page: Page) =>
  page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)

test('every page answer carries the security headers', async ({ request }) => {
  for (const path of ['/', '/households/1', '/join/ABCDEFGH']) {
    const headers = (await request.get(path)).headers()
    const csp = headers['content-security-policy'] ?? ''
    expect(csp, `${path}: Content-Security-Policy`).toContain("frame-ancestors 'none'")
    expect(csp, `${path}: no inline script allowed`).not.toContain('unsafe-inline')
    expect(csp, `${path}: the API is reachable`).toMatch(/connect-src[^;]*'self'/)
    expect(headers['referrer-policy'], `${path}: Referrer-Policy`).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy'], `${path}: Permissions-Policy`).toContain('camera=()')
    expect(headers['x-content-type-options'], `${path}: nosniff`).toBe('nosniff')
  }
})

test('the policy blocks nothing on the main screens, signed out and signed in', async ({ page, request }) => {
  // A forced theme runs public/theme-boot.js before React, the script an inline one used to be
  await page.addInitScript(() => localStorage.setItem('fair-share:theme', 'dark'))
  await page.goto('/')
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  // Each full load starts a new list, so it is read before the next one
  const blocked = await violations(page)

  // A house with an expense, so Tổng quan, the lists and the report all have something to draw
  const tien = shared('Tiến')
  const name = `E2E csp ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const house = await (await request.post(`${API}/api/households`, { data: { name }, headers: bearer(tien) })).json()
  try {
    const ids = [house.member_id as number, await addMember(request, house.id, tien, shared('Minh'))]
    await request.post(`${API}/api/households/${house.id}/expenses`, {
      data: {
        description: 'Điện',
        amount: 200_000,
        payer_id: ids[0],
        spent_at: new Date().toISOString().slice(0, 10),
        split: { type: 'equal', member_ids: ids },
      },
      headers: bearer(tien),
    })

    await signInPage(page, tien)
    for (const path of [
      '/',
      `/households/${house.id}`,
      `/households/${house.id}/expenses`,
      `/households/${house.id}/members`,
      `/households/${house.id}/report`,
      '/account',
    ]) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      blocked.push(...(await violations(page)))
    }
    // The fonts are the app's own, and they did load
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready
      return [...document.fonts].some((face) => face.family.includes('Be Vietnam Pro') && face.status === 'loaded')
    })
    expect(loaded).toBe(true)
    expect(blocked).toEqual([])
  } finally {
    await deleteHousehold(request, house.id, tien)
  }
})
