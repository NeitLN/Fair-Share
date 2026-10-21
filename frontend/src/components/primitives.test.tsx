import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { Avatar, AvatarStack } from './Avatar'
import { Chip, Stamp } from './Chip'
import { Money } from './Money'

const look = (full: string, initial: string, tint = 1) => ({ full, short: full, initial, tint })

describe('Avatar', () => {
  test('shows the initial, is named by the full name and carries its tint', () => {
    render(<Avatar look={look('Nguyễn Duy Anh', 'A', 3)} />)
    const avatar = screen.getByRole('img', { name: 'Nguyễn Duy Anh' })
    expect(avatar).toHaveTextContent('A')
    expect(avatar).toHaveClass('tint-3')
  })

  test('next to a visible name it is hidden from screen readers', () => {
    render(<Avatar look={look('Lan', 'L')} decorative />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  test('a stack shows three, then "+n", and names everyone', () => {
    const looks = ['Tiến', 'Minh', 'Anh', 'Lan', 'Hương'].map((n, i) => look(n, n[0], i + 1))
    render(<AvatarStack looks={looks} />)
    expect(screen.getByRole('img', { name: '5 người: Tiến, Minh, Anh, Lan, Hương' })).toHaveTextContent('TMA+2')
  })
})

describe('Money', () => {
  test('reads as one string with the đ attached', () => {
    const { container } = render(<Money amount={12500000} />)
    expect(container.textContent).toBe('12.500.000đ')
  })

  test('a balance shows its sign and its colour', () => {
    render(
      <>
        <Money amount={200000} kind="balance" />
        <Money amount={-120000} kind="balance" />
        <Money amount={0} kind="balance" />
      </>,
    )
    expect(screen.getByText('+200.000')).toHaveClass('credit-text')
    expect(screen.getByText('−120.000')).toHaveClass('debt-text')
    expect(screen.getByText('0')).not.toHaveClass('credit-text')
  })
})

describe('Chip and Stamp', () => {
  test('a chip is plain text with its kind', () => {
    render(<Chip kind="debt">cần trả</Chip>)
    expect(screen.getByText('cần trả')).toHaveClass('chip', 'chip-debt')
  })

  test('stamps are decorative unless asked', () => {
    const { rerender } = render(<Stamp kind="paid" />)
    expect(screen.getByText('ĐÃ TRẢ')).toHaveAttribute('aria-hidden', 'true')
    rerender(<Stamp kind="settled" decorative={false} />)
    expect(screen.getByText('SẠCH NỢ')).not.toHaveAttribute('aria-hidden')
  })
})
