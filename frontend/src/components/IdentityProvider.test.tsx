import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { useMe } from '../lib/identity'
import { IdentityProvider } from './IdentityProvider'

function Probe() {
  const { me } = useMe()
  return <span>me={String(me)}</span>
}

test('"bạn" is the name the API gives this account in the household', () => {
  render(
    <IdentityProvider me={12}>
      <Probe />
    </IdentityProvider>,
  )
  expect(screen.getByText('me=12')).toBeInTheDocument()
})

test('until the household is loaded, nobody is "bạn"', () => {
  render(
    <IdentityProvider me={null}>
      <Probe />
    </IdentityProvider>,
  )
  expect(screen.getByText('me=null')).toBeInTheDocument()
})

test('outside a household nobody is chosen', () => {
  render(<Probe />)
  expect(screen.getByText('me=null')).toBeInTheDocument()
})
