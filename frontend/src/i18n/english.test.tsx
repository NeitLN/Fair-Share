import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { isValidElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { Transfer } from '../api/types'
import { dayLabel } from '../lib/date'
import { errorMessage } from '../lib/errors'
import { formatSignedVND, formatVND } from '../lib/money'
import { ApiError } from '../api/client'
import { reminderMessage, transferText, verdict } from '../lib/verdict'
import { mockApi, renderApp } from '../test/renderApp'
import en from './en'
import { LANGUAGE_KEY, language, setLanguage } from './index'

// The other tests run in Vietnamese (test/setup.ts); these are the English pages
beforeEach(() => setLanguage('en'))
afterEach(() => vi.unstubAllGlobals())

// Letters only Vietnamese uses. Vietnamese names stay as people type them, so they are allowed.
const VIETNAMESE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i
const NAMES = ['Hoàng Minh', 'Hương']

function texts(value: unknown, path: string): [string, string][] {
  if (typeof value === 'string') return [[path, value]]
  if (typeof value === 'function') {
    // Every sentence function takes names, counts or flags: try it with harmless ones
    const result = (value as (...args: unknown[]) => unknown)('X', 2, true)
    return texts(result, `${path}()`)
  }
  if (isValidElement(value)) return [[path, renderToStaticMarkup(value)]]
  if (Array.isArray(value)) return value.flatMap((item, i) => texts(item, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => texts(item, `${path}.${key}`))
  }
  return []
}

test('no Vietnamese is left in the English words, apart from example names', () => {
  const left = texts(en, 'en')
    .map(([path, text]) => [path, NAMES.reduce((rest, name) => rest.replaceAll(name, ''), text)])
    .filter(([, text]) => VIETNAMESE.test(text))
  expect(left).toEqual([])
})

test('a browser in English opens in English when nothing was chosen on this device', async () => {
  localStorage.removeItem(LANGUAGE_KEY)
  vi.resetModules()
  const fresh = await import('./language')
  expect(fresh.language()).toBe('en')
  expect(document.documentElement.lang).toBe('en')
})

test('the profile talks about groups, and a notice is withdrawn', () => {
  expect(en.verdict.cancelNotice).toBe('Withdraw notice')
  expect(en.profile.nameHint).toBe('Changing it here changes your name in every group you are in.')
  expect(en.profile.renamedEverywhere).toBe('Your name changed in every group.')
  expect(en.profile.renamedNoHouse).toBe('Your name changed. You are not in a group yet.')
  expect(en.profile.statusHint(10, 60)).toBe(
    '10/60 characters. Shown under your name on Members in every group.',
  )
  expect(en.errors.notice_changed).toBe(
    'This notice just changed or was answered. The figures are refreshing; have another look once they show.',
  )
  expect(en.errors.suggestion_changed).toBe(
    'The suggested amount just changed. The figures are refreshing; check them and tell them again.',
  )
})

test('VI switches the whole page, and the choice is remembered on this device', async () => {
  mockApi({ 'GET /api/households': [200, { households: [], pending: [] }] })
  const user = userEvent.setup()
  renderApp('/')

  expect(await screen.findByRole('heading', { level: 1, name: 'Your groups' })).toBeInTheDocument()
  expect(await screen.findByRole('heading', { level: 2, name: "Hi Tiến, let's get started" })).toBeInTheDocument()
  await user.click(screen.getByLabelText(/^Account:/))
  const switcher = screen.getByRole('group', { name: 'Language' })
  expect(within(switcher).getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')

  await user.click(within(switcher).getByRole('button', { name: 'VI' }))

  expect(screen.getByRole('heading', { level: 1, name: 'Nhà của bạn' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: 'Chào Tiến, bắt đầu thôi' })).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Giao diện' })).toBeInTheDocument()
  expect(language()).toBe('vi')
  expect(localStorage.getItem(LANGUAGE_KEY)).toBe('vi')
  expect(document.documentElement.lang).toBe('vi')
  // The tab names the page, in the chosen language (specs/017, FR-024)
  expect(document.title).toBe('Nhà của bạn · Fair-Share')
})

test('money and days are written the English way, and switch back with the language', () => {
  expect(formatVND(240_000)).toBe('240,000 ₫')
  expect(formatSignedVND(-50_000)).toBe('−50,000 ₫')
  const now = new Date(2026, 9, 30)
  expect(dayLabel('2026-10-30', now)).toBe('Today, 30 Oct')
  expect(dayLabel('2026-10-29', now)).toBe('Yesterday, 29 Oct')
  expect(dayLabel('2026-10-24', now)).toBe('Saturday, 24 Oct')
  expect(dayLabel('2025-12-31', now)).toBe('31 Dec 2025')

  setLanguage('vi')
  expect(formatVND(240_000)).toBe('240.000đ')
  expect(dayLabel('2026-10-30', now)).toBe('Hôm nay, 30/10')
})

test('the verdict uses the right verb for one person or several, and never sounds already paid', () => {
  const names: Record<number, string> = { 1: 'Tiến', 2: 'Minh', 3: 'Lan' }
  const nameOf = (id: number) => names[id]
  const t = (from: number, to: number, amount: number): Transfer => ({
    from_member_id: from,
    to_member_id: to,
    amount,
  })

  expect(verdict([t(1, 2, 100_000)], 1, nameOf, true).sentence).toBe('You owe Minh')
  expect(verdict([t(2, 1, 100_000)], 1, nameOf, true).sentence).toBe('Minh owes you')
  expect(verdict([t(2, 1, 1), t(3, 1, 1)], 1, nameOf, true).sentence).toBe('Minh and Lan owe you')
  expect(verdict([t(2, 3, 1)], null, nameOf, true).sentence).toBe('1 repayment left to settle all balances')
  expect(verdict([t(2, 3, 1), t(1, 3, 1)], null, nameOf, true).sentence).toBe(
    '2 repayments left to settle all balances',
  )
  expect(verdict([], 1, nameOf, true).sentence).toBe("Everyone's settled up. Peace at home.")

  expect(transferText(t(1, 2, 1), 1, nameOf)).toBe('You owe Minh')
  expect(transferText(t(2, 1, 1), 1, nameOf)).toBe('Minh owes you')
  expect(transferText(t(2, 3, 1), 1, nameOf)).toBe('Minh owes Lan')
  // A repayment marked as paid reads as done, in the card and its toasts (02/11 review)
  expect(transferText(t(1, 2, 1), 1, nameOf, true)).toBe('You paid Minh')
  expect(transferText(t(2, 3, 1), 1, nameOf, true)).toBe('Minh paid Lan')

  expect(reminderMessage('Room 302', 10, [t(2, 1, 100_000)], nameOf, 'https://x/households/1#k=k')).toBe(
    ["Hi Room 302, here's what's still to pay:", '• Minh owes Tiến 100,000 ₫', 'Details: https://x/households/1#k=k'].join(
      '\n',
    ),
  )
})

test("the API's error codes read as English sentences", () => {
  expect(errorMessage(new ApiError(503, 'database_unavailable', 'The database is not reachable'))).toBe(
    "We can't load your data right now. Try again in a few minutes.",
  )
  // A code the page does not know: the server's own (English) message
  expect(errorMessage(new ApiError(418, 'teapot', "I'm a teapot"))).toBe("I'm a teapot")
})

test('a household frame in English: tabs, invite, members and their chips', async () => {
  const T = '2026-10-20T10:00:00Z'
  mockApi({
    'GET /api/households/7': [200, { id: 7, name: 'Room 302', created_at: T, role: 'owner', member_id: 1 }],
    'GET /api/households/7/members': [
      200,
      [
        { id: 1, household_id: 7, name: 'Võ Việt Tiến', created_at: T, role: 'owner', user_id: 9 },
        { id: 2, household_id: 7, name: 'Hoàng Minh', created_at: T, role: 'member', user_id: 3 },
      ],
    ],
    'GET /api/households/7/invite': [200, { code: 'K7QM2XRT', expires_at: '2026-11-09T00:00:00Z' }],
    'GET /api/households/7/requests': [200, []],
    'GET /api/households/7/balances': [
      200,
      {
        balances: [
          { member_id: 1, name: 'Võ Việt Tiến', paid: 0, owed: 100_000, sent: 0, received: 0, net: -100_000 },
          { member_id: 2, name: 'Hoàng Minh', paid: 100_000, owed: 0, sent: 0, received: 0, net: 100_000 },
        ],
        suggested: [{ from_member_id: 1, to_member_id: 2, amount: 100_000 }],
      },
    ],
  })
  renderApp('/households/7/members')

  expect(await screen.findByRole('heading', { level: 1, name: 'Room 302' })).toBeInTheDocument()
  const tabs = screen.getByRole('navigation', { name: 'Group sections' })
  expect(within(tabs).getAllByRole('link').map((link) => link.textContent)).toEqual([
    'Overview',
    'Expenses',
    'Members',
  ])
  expect(screen.getByRole('heading', { name: 'Invite housemates' })).toBeInTheDocument()
  expect(await screen.findByText('K7QM-2XRT')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'New code' })).toBeInTheDocument()
  // The page joins number and ₫ with a no-break space
  const money = (await screen.findAllByText((_, el) => el?.classList.contains('member-money') ?? false)).map(
    (el) => el.textContent,
  )
  expect(money).toEqual(expect.arrayContaining([expect.stringMatching(/^−100,000\s₫ owes$/), expect.stringMatching(/^\+100,000\s₫ gets back$/)]))
  expect(screen.getByRole('button', { name: 'Rename Võ Việt Tiến' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Remove Hoàng Minh from the group' })).toBeInTheDocument()
  expect(screen.getAllByText('Owner').length).toBeGreaterThan(0)
})

test('the sign-in page in English', async () => {
  renderApp('/', { signedOut: true })
  expect(await screen.findByRole('heading', { level: 1, name: 'Sign in to see your groups' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
  expect(screen.getByLabelText('Password')).toBeInTheDocument()
})
