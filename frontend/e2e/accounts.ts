import type { APIRequestContext, Page } from '@playwright/test'

// Accounts for the end-to-end tests (docs/ACCOUNTS.md). Each run signs up its own accounts with an
// obvious address, so runs never meet; their households are always deleted at the end. The accounts
// stay: the API has no way to delete one yet.

// The API is a different origin in production; locally (Compose) it is the web origin's /api.
export const API = process.env.E2E_API_URL ?? 'https://fair-share-4bu9.onrender.com'

export interface TestAccount {
  token: string
  user: { id: number; email: string; display_name: string }
}

export async function signUp(request: APIRequestContext, name: string): Promise<TestAccount> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@fair-share.test`
  const response = await request.post(`${API}/api/auth/register`, {
    data: { email, password: 'e2e-password-not-secret', display_name: name },
  })
  if (response.status() !== 201) throw new Error(`sign up failed: ${response.status()} ${await response.text()}`)
  return response.json()
}

export const bearer = (account: TestAccount) => ({ Authorization: `Bearer ${account.token}` })

/** The page opens already signed in as `account`, as after a login on this browser. */
export async function signInPage(page: Page, account: TestAccount) {
  await page.addInitScript((session) => {
    localStorage.setItem('fair-share:session', JSON.stringify(session))
  }, account)
}

/** `member` asks to join with the household's code and `owner` approves them under a new name. */
export async function addMember(
  request: APIRequestContext,
  householdId: number,
  owner: TestAccount,
  member: TestAccount,
): Promise<number> {
  const invite = await (await request.get(`${API}/api/households/${householdId}/invite`, { headers: bearer(owner) })).json()
  await request.post(`${API}/api/join`, { data: { code: invite.code }, headers: bearer(member) })
  const approved = await request.post(`${API}/api/households/${householdId}/requests/${member.user.id}/approve`, {
    data: {},
    headers: bearer(owner),
  })
  return (await approved.json()).id
}

export async function deleteHousehold(request: APIRequestContext, householdId: number, owner: TestAccount) {
  return request.delete(`${API}/api/households/${householdId}`, { headers: bearer(owner) })
}
