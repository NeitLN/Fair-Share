import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { renderApp } from '../test/renderApp'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

// Found in the review of #166: a 401 signed out without clearing what was loaded, so on a shared
// device the next account saw the last one's groups until its own answers arrived
test("after a session expires, the next person on this device never sees the last one's groups", async () => {
  let signedInAs = 'An'
  const group = { id: 7, name: 'Nhà của An', created_at: '', role: 'owner', member_id: 1 }
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      const path = new URL(url, 'http://x').pathname
      const method = init.method ?? 'GET'
      if (method === 'POST' && path === '/api/auth/login') {
        signedInAs = 'Bình'
        return json(200, { token: 'binh-token', user: { id: 2, email: 'binh@test.local', display_name: 'Bình' } })
      }
      if (signedInAs === 'An') {
        if (path === '/api/households') return json(200, { households: [group], pending: [] })
        // An's session has expired on the server
        return json(401, { error: { code: 'not_authenticated', message: 'Sign in to continue' } })
      }
      // Bình: every answer is still on its way (a slow phone network)
      return new Promise<Response>(() => {})
    }),
  )
  const user = userEvent.setup()
  const { client } = renderApp('/')
  await user.click(await screen.findByRole('link', { name: /Nhà của An/ }))

  await user.type(await screen.findByLabelText('Email'), 'binh@test.local')
  await user.type(screen.getByLabelText('Mật khẩu'), 'binh-password')
  const buttons = screen.getAllByRole('button', { name: 'Đăng nhập' })
  await user.click(buttons[buttons.length - 1])
  await waitFor(() => expect(screen.queryByLabelText('Mật khẩu')).not.toBeInTheDocument())

  const cached = JSON.stringify(client.getQueryData(['households']) ?? null)
  const onTheGroupPage = document.body.textContent ?? ''
  await user.click(screen.getAllByRole('link')[0])
  const onHome = document.body.textContent ?? ''
  expect({
    cacheHasAn: cached.includes('Nhà của An'),
    groupPageShowsAn: onTheGroupPage.includes('Nhà của An'),
    homeShowsAn: onHome.includes('Nhà của An'),
  }).toEqual({ cacheHasAn: false, groupPageShowsAn: false, homeShowsAn: false })
})
