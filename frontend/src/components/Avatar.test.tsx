import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import type { MemberLook } from '../lib/names'

import { Avatar } from './Avatar'

const lan: MemberLook = { full: 'Ngọc Lan', short: 'Lan', initial: 'L', tint: 3 }
const photo = 'data:image/jpeg;base64,/9j/AA=='

// specs/010-profile-page, US4: a photo in the same circle, the name read once, the initial as fallback
test('without a photo the avatar is the initial', () => {
  render(<Avatar look={lan} />)
  expect(screen.getByRole('img', { name: 'Ngọc Lan' })).toHaveTextContent('L')
})

test('a photo shows in the circle, and the name is still the label, once', () => {
  const { container } = render(<Avatar look={{ ...lan, photo }} />)
  const circle = screen.getByRole('img', { name: 'Ngọc Lan' })
  expect(circle).toHaveClass('avatar', 'has-photo', 'tint-3')
  const img = container.querySelector('img')
  expect(img).toHaveAttribute('src', photo)
  expect(img).toHaveAttribute('alt', '')
  expect(circle).not.toHaveTextContent('L')
})

test('next to a visible name it stays hidden from screen readers, photo or not', () => {
  const { container } = render(<Avatar look={{ ...lan, photo }} decorative />)
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  expect(screen.queryByRole('img', { name: 'Ngọc Lan' })).not.toBeInTheDocument()
})

test('a photo that fails to show falls back to the initial', () => {
  const { container } = render(<Avatar look={{ ...lan, photo }} />)
  fireEvent.error(container.querySelector('img')!)
  expect(container.querySelector('img')).toBeNull()
  expect(screen.getByRole('img', { name: 'Ngọc Lan' })).toHaveTextContent('L')
})
