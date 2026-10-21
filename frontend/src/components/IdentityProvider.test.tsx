import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { Member } from '../api/types'
import { identityKey, readMe, useMe } from '../lib/identity'
import { IdentityProvider } from './IdentityProvider'

const T = '2026-10-20T10:00:00Z'
const member = (id: number, name: string): Member => ({ id, household_id: 1, name, created_at: T })
const HOUSE = [member(11, 'Tiến'), member(12, 'Minh')]

// Shows the choice and lets a test change it, like the chooser will
function Probe({ label = 'probe' }: { label?: string }) {
  const { me, setMe } = useMe()
  return (
    <button type="button" onClick={() => setMe(12)}>
      {label}: {me ?? 'none'}
    </button>
  )
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('identity', () => {
  test('nothing chosen yet', () => {
    render(
      <IdentityProvider householdId={1} members={HOUSE}>
        <Probe />
      </IdentityProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('probe: none')
  })

  test('a choice is kept per household and seen by every page at once', () => {
    render(
      <IdentityProvider householdId={1} members={HOUSE}>
        <Probe label="a" />
        <Probe label="b" />
      </IdentityProvider>,
    )
    act(() => screen.getByText(/^a:/).click())
    expect(screen.getByText(/^b:/)).toHaveTextContent('b: 12')
    expect(localStorage.getItem(identityKey(1))).toBe('12')
    expect(readMe(2)).toBeNull() // another household knows nothing about it
  })

  test('switching household reads that household’s own choice', () => {
    localStorage.setItem(identityKey(1), '11')
    localStorage.setItem(identityKey(2), '21')
    const { rerender } = render(
      <IdentityProvider householdId={1} members={HOUSE}>
        <Probe />
      </IdentityProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('probe: 11')
    rerender(
      <IdentityProvider householdId={2} members={[member(21, 'Hương')]}>
        <Probe />
      </IdentityProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('probe: 21')
  })

  test('while members are loading, a saved choice is kept, not erased', () => {
    localStorage.setItem(identityKey(1), '99')
    render(
      <IdentityProvider householdId={1} members={undefined}>
        <Probe />
      </IdentityProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('probe: 99')
    expect(localStorage.getItem(identityKey(1))).toBe('99')
  })

  test('once loaded, a choice of someone no longer in the house is dropped', () => {
    localStorage.setItem(identityKey(1), '99')
    render(
      <IdentityProvider householdId={1} members={HOUSE}>
        <Probe />
      </IdentityProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('probe: none')
    expect(localStorage.getItem(identityKey(1))).toBeNull()
  })

  test('a choice proven wrong stays dropped even if the members are loading again', () => {
    localStorage.setItem(identityKey(1), '99')
    const { rerender } = render(
      <IdentityProvider householdId={1} members={HOUSE}>
        <Probe />
      </IdentityProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('probe: none')
    rerender(
      <IdentityProvider householdId={1} members={undefined}>
        <Probe />
      </IdentityProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('probe: none')
  })

  test('blocked storage: the choice still works for this visit', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(
      <IdentityProvider householdId={1} members={HOUSE}>
        <Probe />
      </IdentityProvider>,
    )
    act(() => screen.getByRole('button').click())
    expect(screen.getByRole('button')).toHaveTextContent('probe: 12')
  })

  test('outside a household nobody is chosen', () => {
    render(<Probe />)
    expect(screen.getByRole('button')).toHaveTextContent('probe: none')
  })
})
