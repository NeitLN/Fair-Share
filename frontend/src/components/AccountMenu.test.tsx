import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { mockApi, renderApp } from '../test/renderApp'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const noHouses: Record<string, [number, unknown]> = {
  'GET /api/households': [200, { households: [], pending: [] }],
}
const photo = 'data:image/jpeg;base64,/9j/AA=='

// specs/017-houses-profile-redesign, US5: the account button shows the person as the profile does
const button = () => screen.getByLabelText('Tài khoản: Tiến')

test('without a photo the account button shows the initial on the profile colour', async () => {
  mockApi({ ...noHouses, 'GET /api/me/photo': [200, { version: null, data: null }] })
  renderApp('/')
  const avatar = button().querySelector('.avatar')
  // testUser id 9: (9 % 8) + 1, the same tint the profile card uses
  expect(avatar).toHaveClass('tint-2')
  expect(avatar).toHaveTextContent('T')
  // Decoration: the button keeps its own name
  expect(avatar).not.toHaveAttribute('role')
})

test('with a photo it shows the photo, and a new one replaces it without a reload', async () => {
  let current = { version: 'aaaaaaaaaaaa', data: photo }
  mockApi({ ...noHouses, 'GET /api/me/photo': () => [200, current] })
  const { client } = renderApp('/')
  await waitFor(() => expect(button().querySelector('img')).toHaveAttribute('src', photo))

  const next = 'data:image/jpeg;base64,/9j/BB=='
  current = { version: 'bbbbbbbbbbbb', data: next }
  // What the profile does after Lưu ảnh or Gỡ ảnh
  await act(() => client.invalidateQueries({ queryKey: ['me', 'photo'] }))
  await waitFor(() => expect(button().querySelector('img')).toHaveAttribute('src', next))
})
