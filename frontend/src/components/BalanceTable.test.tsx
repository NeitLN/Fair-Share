import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import type { MemberBalance } from '../api/types'
import BalanceTable from './BalanceTable'

const balances: MemberBalance[] = [
  { member_id: 1, name: 'Minh', paid: 240000, owed: 90000, sent: 0, received: 0, net: 150000 },
  { member_id: 2, name: 'Tiến', paid: 60000, owed: 210000, sent: 0, received: 0, net: -150000 },
  { member_id: 3, name: 'An', paid: 0, owed: 0, sent: 0, received: 0, net: 0 },
]

describe('BalanceTable', () => {
  test('has a caption and column headers for screen readers', () => {
    render(<BalanceTable balances={balances} />)

    expect(screen.getByRole('table', { name: 'Số dư của mọi người' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Thành viên' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Đã trả' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Phải trả' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Còn lại' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Minh' })).toBeInTheDocument()
  })

  test('a positive net is marked positive and says "được nhận"', () => {
    render(<BalanceTable balances={balances} />)
    const row = screen.getByRole('row', { name: /Minh/ })

    expect(row).toHaveClass('positive')
    expect(within(row).getByText('được nhận')).toBeInTheDocument()
    expect(within(row).getByText(/240\.000/)).toBeInTheDocument()
    expect(within(row).getByText(/150\.000/)).toBeInTheDocument()
  })

  test('a negative net is marked negative, says "còn nợ" and shows the debt without a minus', () => {
    render(<BalanceTable balances={balances} />)
    const row = screen.getByRole('row', { name: /Tiến/ })

    expect(row).toHaveClass('negative')
    expect(within(row).getByText('còn nợ')).toBeInTheDocument()
    expect(within(row).getByText(/150\.000/)).toBeInTheDocument()
    expect(within(row).queryByText(/-150\.000/)).not.toBeInTheDocument()
  })

  test('a zero net is marked zero and says "đã xong"', () => {
    render(<BalanceTable balances={balances} />)
    const row = screen.getByRole('row', { name: /An/ })

    expect(row).toHaveClass('zero')
    expect(within(row).getByText('đã xong')).toBeInTheDocument()
  })

  test('a load error is not mistaken for an empty table', () => {
    const { unmount } = render(<BalanceTable balances={[]} />)
    expect(screen.getByText('Chưa có dữ liệu số dư.')).toBeInTheDocument()
    unmount()

    render(<BalanceTable balances={[]} error="Không kết nối được tới máy chủ." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Không kết nối được tới máy chủ.')
    expect(screen.queryByText('Chưa có dữ liệu số dư.')).not.toBeInTheDocument()
  })

  test('shows a loading message instead of the table', () => {
    render(<BalanceTable balances={balances} loading />)
    expect(screen.getByText('Đang tải số dư…')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
