import { act, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import type { Expense, Member } from '../api/types'
import ExpenseForm from './ExpenseForm'
import type { ExpenseFormHandle } from './ExpenseForm'

const members: Member[] = [
  { id: 1, household_id: 7, name: 'Tiến', created_at: '' },
  { id: 2, household_id: 7, name: 'Minh', created_at: '' },
  { id: 3, household_id: 7, name: 'Duy Anh', created_at: '' },
]

// Intl puts a non-breaking space before ₫
const plain = (text: string | null) => (text ?? '').replace(/[  ]/g, ' ')

function setup(props: Partial<Parameters<typeof ExpenseForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue({})
  render(
    <ExpenseForm members={members} onSubmit={onSubmit} submitting={false} error={null} {...props} />,
  )
  return { onSubmit: (props.onSubmit as typeof onSubmit) ?? onSubmit, user: userEvent.setup() }
}

async function fillBasics(user: ReturnType<typeof userEvent.setup>, amount = '100000') {
  await user.type(screen.getByLabelText('Nội dung'), 'Tiền điện')
  await user.type(screen.getByLabelText('Số tiền (đồng)'), amount)
}

describe('ExpenseForm, equal split', () => {
  test('everyone takes part by default and sees their share before saving', async () => {
    const { user } = setup()
    await fillBasics(user)

    for (const name of ['Tiến', 'Minh', 'Duy Anh']) {
      expect(screen.getByRole('checkbox', { name })).toBeChecked()
    }
    // 100 000 / 3: the leftover đồng goes to the lowest member id, like the API
    const shares = screen.getAllByText(/₫/).map((el) => plain(el.textContent))
    expect(shares).toEqual(['100.000 ₫', '33.334 ₫', '33.333 ₫', '33.333 ₫'])
  })

  test('saves the body the API expects', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user, '240k')
    await user.selectOptions(screen.getByLabelText('Người trả'), 'Minh')
    await user.click(screen.getByRole('button', { name: 'Thêm khoản chi' }))

    expect(onSubmit).toHaveBeenCalledWith({
      description: 'Tiền điện',
      amount: 240_000,
      payer_id: 2,
      spent_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      source: 'manual',
      split: { type: 'equal', member_ids: [1, 2, 3] },
    })
  })

  test('someone left out is not in the split', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user)
    await user.click(screen.getByRole('checkbox', { name: 'Duy Anh' }))
    await user.click(screen.getByRole('button', { name: 'Thêm khoản chi' }))

    expect(onSubmit.mock.calls[0][0].split).toEqual({ type: 'equal', member_ids: [1, 2] })
  })

  test('nobody selected is refused before reaching the API', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user)
    for (const name of ['Tiến', 'Minh', 'Duy Anh']) {
      await user.click(screen.getByRole('checkbox', { name }))
    }
    await user.click(screen.getByRole('button', { name: 'Thêm khoản chi' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Hãy chọn ít nhất một người cùng chia.')
  })
})

describe('ExpenseForm, custom split', () => {
  test('shows what is left to split while typing, and refuses a mismatch', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user, '240000')
    await user.click(screen.getByRole('radio', { name: 'Chia riêng' }))
    await user.type(screen.getByLabelText('Phần của Minh'), '140000')

    expect(plain(screen.getByText(/Còn lại/).textContent)).toBe('Còn lại: 100.000 ₫')

    await user.click(screen.getByRole('button', { name: 'Thêm khoản chi' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Tổng các phần phải bằng đúng số tiền')
  })

  test('saves only the people with a share once it adds up', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user, '240000')
    await user.click(screen.getByRole('radio', { name: 'Chia riêng' }))
    await user.type(screen.getByLabelText('Phần của Minh'), '140.000')
    await user.type(screen.getByLabelText('Phần của Duy Anh'), '100k')

    expect(screen.getByText('Đã chia khớp số tiền.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Thêm khoản chi' }))
    expect(onSubmit.mock.calls[0][0].split).toEqual({
      type: 'custom',
      shares: [
        { member_id: 2, amount: 140_000 },
        { member_id: 3, amount: 100_000 },
      ],
    })
  })

  test('typing too much says by how much', async () => {
    const { user } = setup()
    await fillBasics(user, '100000')
    await user.click(screen.getByRole('radio', { name: 'Chia riêng' }))
    await user.type(screen.getByLabelText('Phần của Tiến'), '150000')

    expect(plain(screen.getByText(/Vượt quá/).textContent)).toBe('Vượt quá: 50.000 ₫')
  })
})

describe('ExpenseForm, checks and outcomes', () => {
  test('an amount that is not a number is refused', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user, 'hai trăm')
    await user.click(screen.getByRole('button', { name: 'Thêm khoản chi' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Số tiền chưa hợp lệ')
  })

  test('a blank description is refused', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Số tiền (đồng)'), '50000')
    await user.click(screen.getByRole('button', { name: 'Thêm khoản chi' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Nội dung phải từ 1 đến 120 ký tự.')
  })

  test('after saving, the form is ready for the next expense', async () => {
    const { user } = setup()
    await fillBasics(user)
    await user.click(screen.getByRole('button', { name: 'Thêm khoản chi' }))

    expect(screen.getByLabelText('Nội dung')).toHaveValue('')
    expect(screen.getByLabelText('Số tiền (đồng)')).toHaveValue('')
  })

  test('when saving fails, everything typed stays and the server message shows', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('500'))
    const { user } = setup({ onSubmit, error: 'Máy chủ gặp lỗi. Thử lại sau ít phút.' })
    await fillBasics(user)
    await user.click(screen.getByRole('button', { name: 'Thêm khoản chi' }))

    expect(screen.getByLabelText('Nội dung')).toHaveValue('Tiền điện')
    expect(screen.getByRole('alert')).toHaveTextContent('Máy chủ gặp lỗi.')
  })
})

describe('ExpenseForm, editing', () => {
  const dinner: Expense = {
    id: 12,
    household_id: 7,
    description: 'Ăn tối',
    amount: 240_000,
    payer_id: 2,
    spent_at: '2026-10-18',
    source: 'ai',
    created_at: '',
    split_type: 'custom',
    shares: [
      { member_id: 2, amount: 140_000 },
      { member_id: 3, amount: 100_000 },
    ],
  }

  test('starts from the saved expense, custom shares included', () => {
    setup({ initial: dinner, onCancel: vi.fn() })

    expect(screen.getByLabelText('Nội dung')).toHaveValue('Ăn tối')
    expect(screen.getByLabelText('Số tiền (đồng)')).toHaveValue('240000')
    expect(screen.getByLabelText('Người trả')).toHaveValue('2')
    expect(screen.getByLabelText('Ngày')).toHaveValue('2026-10-18')
    expect(screen.getByRole('radio', { name: 'Chia riêng' })).toBeChecked()
    expect(screen.getByLabelText('Phần của Minh')).toHaveValue('140000')
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeInTheDocument()
  })

  test('saving keeps the source, so an AI expense stays marked as AI', async () => {
    const { user, onSubmit } = setup({ initial: dinner })
    const description = screen.getByLabelText('Nội dung')
    await user.clear(description)
    await user.type(description, 'Ăn tối thứ Bảy')
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Ăn tối thứ Bảy', source: 'ai', amount: 240_000 }),
    )
  })

  test('an equal expense opens with only its participants ticked', () => {
    setup({
      initial: {
        ...dinner,
        split_type: 'equal',
        shares: [
          { member_id: 1, amount: 120_000 },
          { member_id: 2, amount: 120_000 },
        ],
      },
    })
    expect(screen.getByRole('checkbox', { name: 'Tiến' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Minh' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Duy Anh' })).not.toBeChecked()
  })
})

describe('ExpenseForm, filled by AI quick add', () => {
  const draft = {
    description: 'Lẩu',
    amount: 240_000,
    payer_id: 2,
    spent_at: '2026-10-19',
    member_ids: [1, 2],
  }

  function setupWithRef() {
    const ref = createRef<ExpenseFormHandle>()
    const result = setup({ ref })
    return { ...result, form: () => ref.current as ExpenseFormHandle }
  }

  test('fills every field the user has not touched, and the expense is saved as AI', async () => {
    const { user, onSubmit, form } = setupWithRef()

    let result
    act(() => {
      result = form().fill(draft)
    })

    expect(result).toEqual({ filled: ['description', 'amount', 'payer', 'date', 'split'], kept: [] })
    expect(screen.getByLabelText('Nội dung')).toHaveValue('Lẩu')
    expect(screen.getByLabelText('Số tiền (đồng)')).toHaveValue('240000')
    expect(screen.getByLabelText('Người trả')).toHaveValue('2')
    expect(screen.getByLabelText('Ngày')).toHaveValue('2026-10-19')
    expect(screen.getByRole('checkbox', { name: 'Duy Anh' })).not.toBeChecked()
    expect(screen.getByLabelText('Số tiền (đồng)')).toHaveClass('just-filled')

    await user.click(screen.getByRole('button', { name: 'Thêm khoản chi' }))
    expect(onSubmit).toHaveBeenCalledWith({
      description: 'Lẩu',
      amount: 240_000,
      payer_id: 2,
      spent_at: '2026-10-19',
      source: 'ai',
      split: { type: 'equal', member_ids: [1, 2] },
    })
  })

  test('never overwrites what the user already typed', async () => {
    const { user, form } = setupWithRef()
    await user.type(screen.getByLabelText('Số tiền (đồng)'), '200000')

    let result
    act(() => {
      result = form().fill(draft)
    })

    expect(result).toEqual({ filled: ['description', 'payer', 'date', 'split'], kept: ['amount'] })
    expect(screen.getByLabelText('Số tiền (đồng)')).toHaveValue('200000')
    expect(screen.getByLabelText('Nội dung')).toHaveValue('Lẩu')
  })

  test('fields the draft is missing stay as they are', () => {
    const { form } = setupWithRef()

    let result
    act(() => {
      result = form().fill({ ...draft, amount: null, payer_id: null })
    })

    expect(result).toEqual({ filled: ['description', 'date', 'split'], kept: [] })
    expect(screen.getByLabelText('Số tiền (đồng)')).toHaveValue('')
    expect(screen.getByLabelText('Người trả')).toHaveValue('1')
  })

  test('a payer or participant who is not in the household is ignored', () => {
    const { form } = setupWithRef()

    act(() => {
      form().fill({ ...draft, payer_id: 99, member_ids: [3, 99] })
    })

    expect(screen.getByLabelText('Người trả')).toHaveValue('1')
    expect(screen.getByRole('checkbox', { name: 'Duy Anh' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Tiến' })).not.toBeChecked()
  })

  test('undo puts the form back as it was, and the expense is manual again', async () => {
    const { user, onSubmit, form } = setupWithRef()
    await user.type(screen.getByLabelText('Nội dung'), 'Ăn tối')

    act(() => {
      form().fill(draft)
    })
    act(() => {
      form().undoFill()
    })

    expect(screen.getByLabelText('Nội dung')).toHaveValue('Ăn tối')
    expect(screen.getByLabelText('Số tiền (đồng)')).toHaveValue('')
    expect(screen.getByRole('checkbox', { name: 'Duy Anh' })).toBeChecked()

    await user.type(screen.getByLabelText('Số tiền (đồng)'), '50000')
    await user.click(screen.getByRole('button', { name: 'Thêm khoản chi' }))
    expect(onSubmit.mock.calls[0][0].source).toBe('manual')
  })

  test('after saving, the next expense is manual and every field can be filled again', async () => {
    const { user, onSubmit, form } = setupWithRef()
    await user.type(screen.getByLabelText('Số tiền (đồng)'), '200000')
    act(() => {
      form().fill(draft)
    })
    await user.click(screen.getByRole('button', { name: 'Thêm khoản chi' }))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ source: 'ai', amount: 200_000 })

    let result
    act(() => {
      result = form().fill(draft)
    })
    expect(result).toEqual({ filled: ['description', 'amount', 'payer', 'date', 'split'], kept: [] })
  })

  test('focusDescription puts the cursor in the description field ("Nhập tay")', () => {
    const { form } = setupWithRef()
    act(() => {
      form().focusDescription()
    })
    expect(screen.getByLabelText('Nội dung')).toHaveFocus()
  })
})

