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

type User = ReturnType<typeof userEvent.setup>

// Amounts read "240.000đ" (lib/money.ts); plain() keeps the helper for any other spacing
const plain = (text: string | null) => (text ?? '').replace(/[  ]/g, ' ')

/** Tiến is using this device unless a test says otherwise, so the payer starts as Tiến. */
function setup(props: Partial<Parameters<typeof ExpenseForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue({})
  const view = render(
    <ExpenseForm
      members={members}
      me={1}
      defaultPayer={1}
      onSubmit={onSubmit}
      submitting={false}
      error={null}
      {...props}
    />,
  )
  return { onSubmit: (props.onSubmit as typeof onSubmit) ?? onSubmit, user: userEvent.setup(), view }
}

const save = (user: User) => user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))
const openSplit = (user: User) => user.click(screen.getByRole('button', { name: 'Sửa cách chia' }))
const openDate = (user: User) => user.click(screen.getByRole('button', { name: 'Đổi ngày' }))
const payerRadio = (name: string) => screen.getByRole('radio', { name: new RegExp(`^${name}`) })
/** The id of the checked "Ai trả?" chip, '' when nobody is chosen. */
const payer = () =>
  (screen.getAllByRole('radio') as HTMLInputElement[]).find((radio) => radio.checked)?.id.replace('payer-', '') ?? ''

async function fillBasics(user: User, amount = '100000') {
  await user.type(screen.getByLabelText('Nội dung'), 'Tiền điện')
  await user.type(screen.getByLabelText('Số tiền'), amount)
}

describe('ExpenseForm, the 90% case', () => {
  test('description, amount and Lưu are enough: today, you paid, everyone equally', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user, '240k')
    expect(screen.getByText('= 240.000đ')).toBeInTheDocument()
    expect(screen.getByText(/^Chia đều cả nhà \(3 người\)$/)).toBeInTheDocument()
    expect(payerRadio('Tiến')).toBeChecked()
    expect(screen.getByText('(bạn)')).toBeInTheDocument()
    await save(user)

    expect(onSubmit).toHaveBeenCalledWith({
      description: 'Tiền điện',
      amount: 240_000,
      payer_id: 1,
      spent_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      source: 'manual',
      split: { type: 'equal', member_ids: [1, 2, 3] },
    })
  })

  test('another payer is one tap on their chip', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user)
    await user.click(payerRadio('Minh'))
    await save(user)
    expect(onSubmit.mock.calls[0][0].payer_id).toBe(2)
  })

  test('without a default payer nobody is chosen, and saving asks for one', async () => {
    const { user, onSubmit } = setup({ me: null, defaultPayer: null })
    await fillBasics(user)
    expect(payer()).toBe('')
    await save(user)

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Chọn người trả.')).toBeInTheDocument()
    expect(payerRadio('Tiến')).toHaveFocus()
  })

  test('choosing "Bạn là ai?" later moves an untouched default payer, never a chosen one', async () => {
    const { user, view } = setup({ me: null, defaultPayer: null })
    view.rerender(
      <ExpenseForm members={members} me={2} defaultPayer={2} onSubmit={vi.fn()} submitting={false} error={null} />,
    )
    expect(payer()).toBe('2')

    await user.click(payerRadio('Anh'))
    view.rerender(
      <ExpenseForm members={members} me={1} defaultPayer={1} onSubmit={vi.fn()} submitting={false} error={null} />,
    )
    expect(payer()).toBe('3')
  })

  test('after a save the next expense starts from the default payer again', async () => {
    const { user, onSubmit } = setup({ me: 3, defaultPayer: 3 })
    await fillBasics(user)
    await user.click(payerRadio('Minh'))
    await save(user)
    expect(onSubmit.mock.calls[0][0].payer_id).toBe(2)
    expect(payer()).toBe('3')
  })

  test('the folded controls are always there for aria-controls, hidden while folded', () => {
    setup()
    for (const name of ['Đổi ngày', 'Sửa cách chia']) {
      const button = screen.getByRole('button', { name })
      const target = document.getElementById(button.getAttribute('aria-controls') as string)
      expect(target).not.toBeNull()
      expect(target).toHaveAttribute('hidden')
    }
  })

  test('choosing "Bạn là ai?" fills a missing payer and takes its message away', async () => {
    const { user, view } = setup({ me: null, defaultPayer: null })
    await fillBasics(user)
    await save(user)
    expect(screen.getByText('Chọn người trả.')).toBeInTheDocument()
    view.rerender(
      <ExpenseForm members={members} me={2} defaultPayer={2} onSubmit={vi.fn()} submitting={false} error={null} />,
    )
    expect(payer()).toBe('2')
    expect(screen.queryByText('Chọn người trả.')).not.toBeInTheDocument()
  })

  test('the date is folded as "Hôm nay"; Đổi opens the field in place', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user)
    expect(screen.getByText('Hôm nay')).toBeInTheDocument()
    await openDate(user)
    const date = screen.getByLabelText('Ngày')
    await user.clear(date)
    await user.type(date, '2026-10-18')
    await save(user)
    expect(onSubmit.mock.calls[0][0].spent_at).toBe('2026-10-18')
  })
})

describe('ExpenseForm, equal split', () => {
  test('everyone takes part by default and sees their share before saving', async () => {
    const { user } = setup()
    await fillBasics(user)
    await openSplit(user)

    for (const name of ['Tiến', 'Minh', 'Anh']) {
      expect(screen.getByRole('checkbox', { name })).toBeChecked()
    }
    // 100 000 / 3: the leftover đồng goes to the lowest member id, like the API
    const shares = screen.getAllByText(/^[\d.]+đ$/).map((el) => plain(el.textContent))
    expect(shares).toEqual(['33.334đ', '33.333đ', '33.333đ'])
  })

  test('someone left out is not in the split, and the fold says so', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user)
    await openSplit(user)
    await user.click(screen.getByRole('checkbox', { name: 'Anh' }))
    expect(screen.getByText('Chia đều (2/3 người)')).toBeInTheDocument()
    await save(user)

    expect(onSubmit.mock.calls[0][0].split).toEqual({ type: 'equal', member_ids: [1, 2] })
  })

  test('nobody selected is refused before reaching the API, under the split', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user)
    await openSplit(user)
    for (const name of ['Tiến', 'Minh', 'Anh']) {
      await user.click(screen.getByRole('checkbox', { name }))
    }
    await save(user)

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Hãy chọn ít nhất một người cùng chia.')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Cách chia' })).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('ExpenseForm, custom split', () => {
  test('shows what is left to split while typing, and refuses a mismatch', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user, '240000')
    await openSplit(user)
    await user.click(screen.getByRole('button', { name: 'Chia riêng' }))
    await user.type(screen.getByLabelText('Phần của Minh'), '140000')

    expect(plain(screen.getByText(/Còn lại/).textContent)).toBe('Còn lại: 100.000đ')

    await save(user)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Tổng các phần phải bằng đúng số tiền của khoản chi.')).toBeInTheDocument()
  })

  test('saves only the people with a share once it adds up', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user, '240000')
    await openSplit(user)
    await user.click(screen.getByRole('button', { name: 'Chia riêng' }))
    await user.type(screen.getByLabelText('Phần của Minh'), '140.000')
    await user.type(screen.getByLabelText('Phần của Anh'), '100k')

    expect(screen.getByText('Đã chia khớp số tiền.')).toBeInTheDocument()
    expect(screen.getByText('Chia riêng (2 người)')).toBeInTheDocument()
    await save(user)
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
    await openSplit(user)
    await user.click(screen.getByRole('button', { name: 'Chia riêng' }))
    await user.type(screen.getByLabelText('Phần của Tiến'), '150000')

    expect(plain(screen.getByText(/Vượt quá/).textContent)).toBe('Vượt quá: 50.000đ')
  })
})

describe('ExpenseForm, checks and outcomes', () => {
  test('an amount that is not a number is refused under the field, which gets focus', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user, 'hai trăm')
    await save(user)

    expect(onSubmit).not.toHaveBeenCalled()
    const amount = screen.getByLabelText('Số tiền')
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    expect(amount).toHaveAccessibleDescription(/Số tiền chưa hợp lệ/)
    expect(amount).toHaveFocus()
  })

  test('every problem is shown at once; the first invalid field gets focus', async () => {
    const { user, onSubmit } = setup({ me: null, defaultPayer: null })
    await user.type(screen.getByLabelText('Số tiền'), 'abc')
    await save(user)

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Nội dung phải từ 1 đến 120 ký tự.')).toBeInTheDocument()
    expect(screen.getByText(/^Số tiền chưa hợp lệ/)).toBeInTheDocument()
    expect(screen.getByText('Chọn người trả.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nội dung')).toHaveFocus()

    // Fixing a field takes its message away
    await user.type(screen.getByLabelText('Nội dung'), 'Lẩu')
    expect(screen.queryByText('Nội dung phải từ 1 đến 120 ký tự.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nội dung')).not.toHaveAttribute('aria-invalid')
  })

  test('a split problem opens the folded split and focuses it', async () => {
    const { user } = setup({
      initial: {
        id: 9,
        household_id: 7,
        description: 'Ăn tối',
        amount: 240_000,
        payer_id: 2,
        spent_at: '2026-10-18',
        source: 'manual',
        created_at: '',
        split_type: 'custom',
        shares: [{ member_id: 2, amount: 100_000 }],
      },
    })
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))

    expect(screen.getByText('Tổng các phần phải bằng đúng số tiền của khoản chi.')).toBeInTheDocument()
    // The way of splitting in use gets focus, and its button carries the message
    const custom = screen.getByRole('button', { name: 'Chia riêng' })
    expect(custom).toHaveFocus()
    expect(custom).toHaveAccessibleDescription('Tổng các phần phải bằng đúng số tiền của khoản chi.')
  })

  test('after saving, the form is ready for the next expense', async () => {
    const { user } = setup()
    await fillBasics(user)
    await save(user)

    expect(screen.getByLabelText('Nội dung')).toHaveValue('')
    expect(screen.getByLabelText('Số tiền')).toHaveValue('')
    expect(payerRadio('Tiến')).toBeChecked()
  })

  test('when saving fails, everything typed stays and the server message shows above the button', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('500'))
    const { user } = setup({ onSubmit, error: 'Máy chủ gặp lỗi. Thử lại sau ít phút.' })
    await fillBasics(user)
    await save(user)

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

  test('starts from the saved expense, custom shares included', async () => {
    const { user } = setup({ initial: dinner, onCancel: vi.fn() })

    expect(screen.getByLabelText('Nội dung')).toHaveValue('Ăn tối')
    expect(screen.getByLabelText('Số tiền')).toHaveValue('240000')
    // The saved payer, not the device's default
    expect(payer()).toBe('2')
    expect(screen.getByText('Chia riêng (2 người)')).toBeInTheDocument()
    await openDate(user)
    expect(screen.getByLabelText('Ngày')).toHaveValue('2026-10-18')
    await openSplit(user)
    expect(screen.getByRole('button', { name: 'Chia riêng' })).toHaveAttribute('aria-pressed', 'true')
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

  test('an equal expense opens with only its participants ticked', async () => {
    const { user } = setup({
      initial: {
        ...dinner,
        split_type: 'equal',
        shares: [
          { member_id: 1, amount: 120_000 },
          { member_id: 2, amount: 120_000 },
        ],
      },
    })
    expect(screen.getByText('Chia đều (2/3 người)')).toBeInTheDocument()
    await openSplit(user)
    expect(screen.getByRole('checkbox', { name: 'Tiến' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Minh' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Anh' })).not.toBeChecked()
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

  function setupWithRef(props: Partial<Parameters<typeof ExpenseForm>[0]> = {}) {
    const ref = createRef<ExpenseFormHandle>()
    const result = setup({ ref, ...props })
    return { ...result, form: () => ref.current as ExpenseFormHandle }
  }

  test('fills every field the user has not touched, and the expense is saved as AI', async () => {
    const { user, onSubmit, form } = setupWithRef()

    let result
    act(() => {
      result = form().fill(draft)
    })

    // The default payer (you) and the default split are not user changes: the AI may replace them
    expect(result).toEqual({
      filled: ['description', 'amount', 'payer', 'date', 'split'],
      kept: [],
      cleared: [],
    })
    expect(screen.getByLabelText('Nội dung')).toHaveValue('Lẩu')
    expect(screen.getByLabelText('Số tiền')).toHaveValue('240000')
    expect(payer()).toBe('2')
    expect(screen.getByText('Chia đều (2/3 người)')).toBeInTheDocument()
    expect(screen.getByLabelText('Số tiền')).toHaveClass('just-filled')
    expect(screen.getByRole('group', { name: 'Ai trả?' })).toHaveClass('just-filled')
    await openDate(user)
    expect(screen.getByLabelText('Ngày')).toHaveValue('2026-10-19')

    await save(user)
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
    await user.type(screen.getByLabelText('Số tiền'), '200000')

    let result
    act(() => {
      result = form().fill(draft)
    })

    expect(result).toEqual({
      filled: ['description', 'payer', 'date', 'split'],
      kept: ['amount'],
      cleared: [],
    })
    expect(screen.getByLabelText('Số tiền')).toHaveValue('200000')
    expect(screen.getByLabelText('Nội dung')).toHaveValue('Lẩu')
  })

  test('the payer chips and the date fold count as user changes', async () => {
    const { user, form } = setupWithRef()
    await user.click(payerRadio('Anh'))
    await openDate(user)
    const date = screen.getByLabelText('Ngày')
    await user.clear(date)
    await user.type(date, '2026-10-17')

    let result
    act(() => {
      result = form().fill(draft)
    })
    expect(result).toMatchObject({ kept: ['payer', 'date'] })
    expect(payer()).toBe('3')
    expect(screen.getByLabelText('Ngày')).toHaveValue('2026-10-17')
  })

  test('a payer the AI filled stays when "Bạn là ai?" changes, even if it was the default person', () => {
    const { form, view } = setupWithRef()
    act(() => {
      form().fill({ ...draft, payer_id: 1 })
    })
    view.rerender(
      <ExpenseForm members={members} me={2} defaultPayer={2} onSubmit={vi.fn()} submitting={false} error={null} />,
    )
    expect(payer()).toBe('1')
  })

  test('a payer the AI cleared stays empty when "Bạn là ai?" changes', () => {
    const { form, view } = setupWithRef()
    act(() => {
      form().fill({ ...draft, payer_id: null })
    })
    view.rerender(
      <ExpenseForm members={members} me={2} defaultPayer={2} onSubmit={vi.fn()} submitting={false} error={null} />,
    )
    expect(payer()).toBe('')
  })

  test('undoing the fill gives the payer back to the default, which follows "Bạn là ai?" again', () => {
    const ref = createRef<ExpenseFormHandle>()
    const { view } = setup({ ref })
    act(() => {
      ref.current?.fill(draft)
    })
    act(() => {
      ref.current?.undoFill()
    })
    view.rerender(
      <ExpenseForm ref={ref} members={members} me={3} defaultPayer={3} onSubmit={vi.fn()} submitting={false} error={null} />,
    )
    expect(payer()).toBe('3')
  })

  test('a fill and its undo work on the folded split; the fold row says what it holds', async () => {
    const { user, form } = setupWithRef()
    act(() => {
      form().fill(draft)
    })
    expect(screen.getByText('Chia đều (2/3 người)')).toBeInTheDocument()
    expect(screen.getByText('Chia đều (2/3 người)').closest('.fold-field')).toHaveClass('just-filled')
    act(() => {
      form().undoFill()
    })
    expect(screen.getByText('Chia đều cả nhà (3 người)')).toBeInTheDocument()
    await openSplit(user)
    expect(screen.getByRole('button', { name: 'Chia đều' })).toHaveAttribute('aria-pressed', 'true')
    for (const name of ['Tiến', 'Minh', 'Anh']) {
      expect(screen.getByRole('checkbox', { name })).toBeChecked()
    }
  })

  test('opening a fold is not a change: the split can still be filled', async () => {
    const { user, form } = setupWithRef()
    await openSplit(user)

    let result
    act(() => {
      result = form().fill(draft)
    })
    expect(result).toMatchObject({ kept: [] })
    expect(screen.getByRole('checkbox', { name: 'Anh' })).not.toBeChecked()
  })

  test('no amount or payer in the draft empties those fields instead of keeping a default', () => {
    const { form } = setupWithRef()

    let result
    act(() => {
      result = form().fill({ ...draft, amount: null, payer_id: null })
    })

    expect(result).toEqual({
      filled: ['description', 'date', 'split'],
      kept: [],
      cleared: ['amount', 'payer'],
    })
    expect(screen.getByLabelText('Số tiền')).toHaveValue('')
    // The default payer (you) is not passed off as the AI's answer
    expect(payer()).toBe('')
  })

  test('a payer the user chose is kept even when the draft has none', async () => {
    const { user, form } = setupWithRef()
    await user.click(payerRadio('Minh'))

    let result
    act(() => {
      result = form().fill({ ...draft, payer_id: null })
    })

    expect(result).toMatchObject({ cleared: [] })
    expect(payer()).toBe('2')
  })

  test('a payer or participant who is not in the household is ignored', async () => {
    const { user, form } = setupWithRef()

    act(() => {
      form().fill({ ...draft, payer_id: 99, member_ids: [3, 99] })
    })

    // An unknown payer is like no payer: the field is emptied for the user to choose
    expect(payer()).toBe('')
    await openSplit(user)
    expect(screen.getByRole('checkbox', { name: 'Anh' })).toBeChecked()
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
    expect(screen.getByLabelText('Số tiền')).toHaveValue('')
    expect(payer()).toBe('1')
    expect(screen.getByText('Chia đều cả nhà (3 người)')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Số tiền'), '50000')
    await save(user)
    expect(onSubmit.mock.calls[0][0].source).toBe('manual')
  })

  test('after saving, the next expense is manual and every field can be filled again', async () => {
    const { user, onSubmit, form } = setupWithRef()
    await user.type(screen.getByLabelText('Số tiền'), '200000')
    act(() => {
      form().fill(draft)
    })
    await save(user)
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ source: 'ai', amount: 200_000 })

    let result
    act(() => {
      result = form().fill(draft)
    })
    expect(result).toEqual({
      filled: ['description', 'amount', 'payer', 'date', 'split'],
      kept: [],
      cleared: [],
    })
  })

  test('undo restores only the fields nobody edited after the fill', async () => {
    const { user, form } = setupWithRef()
    act(() => {
      form().fill(draft)
    })
    const description = screen.getByLabelText('Nội dung')
    await user.clear(description)
    await user.type(description, 'Lẩu thứ Sáu')
    act(() => {
      form().undoFill()
    })

    // The edit survives; the fields the AI filled and nobody touched go back
    expect(description).toHaveValue('Lẩu thứ Sáu')
    expect(screen.getByLabelText('Số tiền')).toHaveValue('')
    expect(payer()).toBe('1')
  })

  test('a split the user changed is kept whole by a fill, custom amounts included', async () => {
    const { user, form } = setupWithRef()
    await user.type(screen.getByLabelText('Số tiền'), '240000')
    await openSplit(user)
    await user.click(screen.getByRole('button', { name: 'Chia riêng' }))
    await user.type(screen.getByLabelText('Phần của Minh'), '240000')

    let result
    act(() => {
      result = form().fill(draft)
    })
    // The user had changed the split, so the whole group is kept, amounts included
    expect(result).toMatchObject({ kept: ['amount', 'split'] })
    expect(screen.getByRole('button', { name: 'Chia riêng' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Phần của Minh')).toHaveValue('240000')
  })

  test('an untouched split is filled as one group: equal, these people, no custom amounts', async () => {
    const { user, form, onSubmit } = setupWithRef()
    act(() => {
      form().fill(draft)
    })
    await openSplit(user)
    await user.click(screen.getByRole('button', { name: 'Chia riêng' }))
    expect(screen.getByLabelText('Phần của Minh')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Chia đều' }))
    await save(user)
    expect(onSubmit.mock.calls[0][0].split).toEqual({ type: 'equal', member_ids: [1, 2] })
  })

  test('focusDescription puts the cursor in the description field ("Nhập tay")', () => {
    const { form } = setupWithRef()
    act(() => {
      form().focusDescription()
    })
    expect(screen.getByLabelText('Nội dung')).toHaveFocus()
  })
})
