import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, test, vi } from 'vitest'

import HouseholdList from './HouseholdList'

const renderList = (props: Partial<Parameters<typeof HouseholdList>[0]> = {}) =>
  render(
    <MemoryRouter>
      <HouseholdList
        households={[
          { id: 1, name: 'Nhà trọ 123' },
          { id: 2, name: 'Chung cư 456' },
        ]}
        onRetry={vi.fn()}
        onForget={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  )

describe('HouseholdList', () => {
  test('links every household to its own page', () => {
    renderList()
    expect(screen.getByRole('link', { name: 'Nhà trọ 123' })).toHaveAttribute('href', '/households/1')
    expect(screen.getByRole('link', { name: 'Chung cư 456' })).toHaveAttribute('href', '/households/2')
  })

  test('says what to do when this browser knows no household yet', () => {
    renderList({ households: [] })
    expect(screen.getByText(/Máy này chưa có nhà nào\. Tạo nhà đầu tiên, hoặc mở đường dẫn/)).toBeInTheDocument()
  })

  test('a household still loading shows a placeholder, one that failed shows why and Thử lại', async () => {
    const onRetry = vi.fn()
    renderList({ households: [{ id: 1, loading: true }, { id: 2, error: 'Không kết nối được tới máy chủ.' }], onRetry })
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải nhà')
    expect(screen.getByRole('alert')).toHaveTextContent('Không kết nối được tới máy chủ.')
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(onRetry).toHaveBeenCalledWith(2)
  })

  test('each household can be taken off the list by its name', async () => {
    const onForget = vi.fn()
    renderList({ onForget })
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ Chung cư 456 khỏi danh sách' }))
    expect(onForget).toHaveBeenCalledWith({ id: 2, name: 'Chung cư 456' })
  })
})
