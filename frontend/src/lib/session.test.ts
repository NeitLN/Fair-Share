import { expect, test } from 'vitest'

import { sessionEnded, signIn, signOut } from './session'

const session = { token: 't', user: { id: 9, email: 'tien@test.local', display_name: 'Tiến' } }
const kept = 'fair-share:expense-draft:9:7'

// Review 12/11, E10/F16 and the review of #301: what a session's end keeps, and what Đăng xuất forgets
test('Đăng xuất forgets the expense being typed; a session that ended keeps it and says so', () => {
  signIn(session)
  sessionStorage.setItem(kept, '{"description":"Đi chợ","amountText":"1"}')
  signOut('ended')
  expect(sessionStorage.getItem(kept)).not.toBeNull()
  expect(sessionEnded()).toBe(true)

  signIn(session)
  expect(sessionEnded()).toBe(false)
  signOut()
  expect(sessionStorage.getItem(kept)).toBeNull()
  expect(sessionEnded()).toBe(false)
})
