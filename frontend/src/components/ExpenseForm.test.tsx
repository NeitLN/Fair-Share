import { act, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import type { Expense, Member, RecurringItem } from '../api/types'
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
    expect(screen.getByText(/^Chia đều cả nhà · 3 người$/)).toBeInTheDocument()
    expect(payerRadio('Tiến')).toBeChecked()
    expect(screen.getByText('(bạn)')).toBeInTheDocument()
    await save(user)

    expect(onSubmit).toHaveBeenCalledWith({
      description: 'Tiền điện',
      amount: 240_000,
      payer_id: 1,
      spent_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      source: 'manual',
      // Guessed from "Tiền điện" with no press (specs/005-expense-categories)
      category: 'utilities',
      split: { type: 'equal', member_ids: [1, 2, 3] },
    })
  })

  test('millions the way rent is written: "1tr5" shows and saves 1.500.000đ (#141)', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user, '1tr5')
    expect(screen.getByText('= 1.500.000đ')).toBeInTheDocument()
    await save(user)
    expect(onSubmit.mock.calls[0][0].amount).toBe(1_500_000)
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

    await user.click(payerRadio('Duy Anh'))
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
    const date = screen.getByLabelText('Ngày trả')
    await user.clear(date)
    await user.type(date, '2026-10-18')
    await save(user)
    expect(onSubmit.mock.calls[0][0].spent_at).toBe('2026-10-18')
  })

  test('a year outside 2000-2099 is refused under the date, before the API (T-25)', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user)
    await openDate(user)
    const date = screen.getByLabelText('Ngày trả')
    expect(date).toHaveAttribute('min', '2000-01-01')
    expect(date).toHaveAttribute('max', '2099-12-31')
    await user.clear(date)
    await user.type(date, '1999-12-31')
    await save(user)

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Ngày phải trong khoảng 01/01/2000 đến 31/12/2099.')).toBeInTheDocument()
  })
})

describe('ExpenseForm, equal split', () => {
  test('everyone takes part by default and sees their share before saving', async () => {
    const { user } = setup()
    await fillBasics(user)
    await openSplit(user)

    for (const name of ['Tiến', 'Minh', 'Duy Anh']) {
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
    await user.click(screen.getByRole('checkbox', { name: 'Duy Anh' }))
    expect(screen.getByText('Chia đều · 2/3 người')).toBeInTheDocument()
    await save(user)

    expect(onSubmit.mock.calls[0][0].split).toEqual({ type: 'equal', member_ids: [1, 2] })
  })

  test('after a save the next expense is split equally between everyone again (DESIGN.md)', async () => {
    // Found in the 02/11 review: the form kept the last split, so someone left out of one expense
    // was silently left out of the next one too
    const { user, onSubmit } = setup()
    await fillBasics(user)
    await openSplit(user)
    await user.click(screen.getByRole('checkbox', { name: 'Duy Anh' }))
    await save(user)

    expect(screen.getByText(/^Chia đều cả nhà · 3 người$/)).toBeInTheDocument()
    await fillBasics(user)
    await save(user)
    expect(onSubmit.mock.calls[1][0].split).toEqual({ type: 'equal', member_ids: [1, 2, 3] })
  })

  test('after a custom split the next expense is split equally again', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user, '240000')
    await openSplit(user)
    await user.click(screen.getByRole('button', { name: 'Tự chia' }))
    await user.type(screen.getByLabelText('Phần của Tiến'), '140000')
    await user.type(screen.getByLabelText('Phần của Minh'), '100000')
    await save(user)
    expect(onSubmit.mock.calls[0][0].split.type).toBe('custom')

    await fillBasics(user)
    await save(user)
    expect(onSubmit.mock.calls[1][0].split).toEqual({ type: 'equal', member_ids: [1, 2, 3] })
  })

  test('nobody selected is refused before reaching the API, under the split', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user)
    await openSplit(user)
    for (const name of ['Tiến', 'Minh', 'Duy Anh']) {
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
    await user.click(screen.getByRole('button', { name: 'Tự chia' }))
    await user.type(screen.getByLabelText('Phần của Minh'), '140000')

    expect(plain(screen.getByText(/Chưa chia/).textContent)).toBe('Chưa chia: 100.000đ')

    await save(user)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Tổng các phần phải bằng đúng số tiền của khoản chi.')).toBeInTheDocument()
  })

  test('saves only the people with a share once it adds up', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user, '240000')
    await openSplit(user)
    await user.click(screen.getByRole('button', { name: 'Tự chia' }))
    await user.type(screen.getByLabelText('Phần của Minh'), '140.000')
    await user.type(screen.getByLabelText('Phần của Duy Anh'), '100k')

    expect(screen.getByText('Đã chia khớp số tiền.')).toBeInTheDocument()
    expect(screen.getByText(/^Tự chia · 2 người$/)).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: 'Tự chia' }))
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
    // An empty field says what to enter; something typed that is not money gets the examples
    expect(screen.getByText('Nhập nội dung khoản chi.')).toBeInTheDocument()
    expect(screen.getByText(/^Số tiền chưa hợp lệ/)).toBeInTheDocument()
    expect(screen.getByText('Chọn người trả.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nội dung')).toHaveFocus()

    // Fixing a field takes its message away
    await user.type(screen.getByLabelText('Nội dung'), 'Lẩu')
    expect(screen.queryByText('Nhập nội dung khoản chi.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nội dung')).not.toHaveAttribute('aria-invalid')
  })

  test('an empty amount asks for one, without the format examples', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Nội dung'), 'Lẩu')
    await save(user)

    expect(screen.getByLabelText('Số tiền')).toHaveAccessibleDescription(/Nhập số tiền\./)
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
        category: 'other',
        created_at: '',
        split_type: 'custom',
        shares: [{ member_id: 2, amount: 100_000 }],
      },
    })
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))

    expect(screen.getByText('Tổng các phần phải bằng đúng số tiền của khoản chi.')).toBeInTheDocument()
    // The way of splitting in use gets focus, and its button carries the message
    const custom = screen.getByRole('button', { name: 'Tự chia' })
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
    category: 'other',
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
    expect(screen.getByText(/^Tự chia · 2 người$/)).toBeInTheDocument()
    await openDate(user)
    expect(screen.getByLabelText('Ngày trả')).toHaveValue('2026-10-18')
    await openSplit(user)
    expect(screen.getByRole('button', { name: 'Tự chia' })).toHaveAttribute('aria-pressed', 'true')
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
    expect(screen.getByText('Chia đều · 2/3 người')).toBeInTheDocument()
    await openSplit(user)
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
    expect(screen.getByText('Chia đều · 2/3 người')).toBeInTheDocument()
    expect(screen.getByLabelText('Số tiền')).toHaveClass('just-filled')
    expect(screen.getByRole('group', { name: 'Ai trả?' })).toHaveClass('just-filled')
    await openDate(user)
    expect(screen.getByLabelText('Ngày trả')).toHaveValue('2026-10-19')

    await save(user)
    expect(onSubmit).toHaveBeenCalledWith({
      description: 'Lẩu',
      amount: 240_000,
      payer_id: 2,
      spent_at: '2026-10-19',
      source: 'ai',
      // The AI is not asked for a category: the form guesses it from the drafted "Lẩu"
      category: 'food',
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
    await user.click(payerRadio('Duy Anh'))
    await openDate(user)
    const date = screen.getByLabelText('Ngày trả')
    await user.clear(date)
    await user.type(date, '2026-10-17')

    let result
    act(() => {
      result = form().fill(draft)
    })
    expect(result).toMatchObject({ kept: ['payer', 'date'] })
    expect(payer()).toBe('3')
    expect(screen.getByLabelText('Ngày trả')).toHaveValue('2026-10-17')
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

  test('"Bạn là ai?" changed between a fill and its undo: undo gives the payer to the new default', () => {
    const ref = createRef<ExpenseFormHandle>()
    const { view } = setup({ ref })
    act(() => {
      ref.current?.fill(draft)
    })
    view.rerender(
      <ExpenseForm ref={ref} members={members} me={3} defaultPayer={3} onSubmit={vi.fn()} submitting={false} error={null} />,
    )
    // The AI's payer is kept while the identity changes...
    expect(payer()).toBe('2')
    act(() => {
      ref.current?.undoFill()
    })
    // ...and undoing returns it to today's default, not the one from before the fill
    expect(payer()).toBe('3')
  })

  test('a fill and its undo work on the folded split; the fold row says what it holds', async () => {
    const { user, form } = setupWithRef()
    act(() => {
      form().fill(draft)
    })
    expect(screen.getByText('Chia đều · 2/3 người')).toBeInTheDocument()
    expect(screen.getByText('Chia đều · 2/3 người').closest('.fold-field')).toHaveClass('just-filled')
    act(() => {
      form().undoFill()
    })
    expect(screen.getByText('Chia đều cả nhà · 3 người')).toBeInTheDocument()
    await openSplit(user)
    expect(screen.getByRole('button', { name: 'Chia đều' })).toHaveAttribute('aria-pressed', 'true')
    for (const name of ['Tiến', 'Minh', 'Duy Anh']) {
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
    expect(screen.getByRole('checkbox', { name: 'Duy Anh' })).not.toBeChecked()
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
    expect(screen.getByLabelText('Số tiền')).toHaveValue('')
    expect(payer()).toBe('1')
    expect(screen.getByText('Chia đều cả nhà · 3 người')).toBeInTheDocument()

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
    await user.click(screen.getByRole('button', { name: 'Tự chia' }))
    await user.type(screen.getByLabelText('Phần của Minh'), '240000')

    let result
    act(() => {
      result = form().fill(draft)
    })
    // The user had changed the split, so the whole group is kept, amounts included
    expect(result).toMatchObject({ kept: ['amount', 'split'] })
    expect(screen.getByRole('button', { name: 'Tự chia' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Phần của Minh')).toHaveValue('240000')
  })

  test('an untouched split is filled as one group: equal, these people, no custom amounts', async () => {
    const { user, form, onSubmit } = setupWithRef()
    act(() => {
      form().fill(draft)
    })
    await openSplit(user)
    await user.click(screen.getByRole('button', { name: 'Tự chia' }))
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

describe('ExpenseForm, the note beside Cách chia', () => {
  const note = 'AI chia cho cả nhà, bạn kiểm tra lại.'
  const filled = {
    description: 'Lẩu',
    amount: 240_000,
    payer_id: 2,
    spent_at: '2026-10-21',
    member_ids: [1, 2, 3],
    splitNote: note,
  }

  function setupWithRef() {
    const ref = createRef<ExpenseFormHandle>()
    const onSubmit = vi.fn().mockResolvedValue({})
    render(
      <ExpenseForm ref={ref} members={members} onSubmit={onSubmit} submitting={false} error={null} />,
    )
    return { form: () => ref.current as ExpenseFormHandle, onSubmit, user: userEvent.setup() }
  }

  test('a split filled by the AI shows its note under Cách chia, tied to the Sửa button', () => {
    const { form } = setupWithRef()
    act(() => {
      form().fill(filled)
    })

    const shown = screen.getByText(note)
    expect(shown).toHaveAttribute('id', 'expense-split-note')
    expect(screen.getByRole('button', { name: 'Sửa cách chia' })).toHaveAttribute(
      'aria-describedby',
      'expense-split-note',
    )
  })

  test('no note when the user had set the split: the AI did not fill it', async () => {
    const { form, user } = setupWithRef()
    await user.click(screen.getByRole('button', { name: 'Sửa cách chia' }))
    await user.click(screen.getByRole('checkbox', { name: 'Duy Anh' }))
    act(() => {
      form().fill(filled)
    })

    expect(screen.queryByText(note)).not.toBeInTheDocument()
  })

  test('the note goes away once the user changes the split, and a later fill keeps their split', async () => {
    const { form, user } = setupWithRef()

    act(() => {
      form().fill(filled)
    })
    await user.click(screen.getByRole('button', { name: 'Sửa cách chia' }))
    await user.click(screen.getByRole('checkbox', { name: 'Duy Anh' }))
    expect(screen.queryByText(note)).not.toBeInTheDocument()

    act(() => {
      form().fill(filled)
    })
    // The split is the user's now, so this fill keeps it and shows no note
    expect(screen.queryByText(note)).not.toBeInTheDocument()
  })

  test('undo takes the note away with the split it described', () => {
    const { form } = setupWithRef()
    act(() => {
      form().fill(filled)
    })
    act(() => {
      form().undoFill()
    })
    expect(screen.queryByText(note)).not.toBeInTheDocument()
  })

  test('after saving, the next expense has no note', async () => {
    const { form, user } = setupWithRef()
    act(() => {
      form().fill(filled)
    })
    await user.click(screen.getByRole('button', { name: /Lưu khoản chi/ }))
    expect(screen.queryByText(note)).not.toBeInTheDocument()
  })
})

describe('ExpenseForm, named amounts from AI quick add (specs/009-ai-custom-split)', () => {
  // "lẩu 500k Tiến trả, Minh 200k, Duy Anh 100k": Tiến takes the other 200k
  const custom = {
    description: 'Lẩu',
    amount: 500_000,
    payer_id: 1,
    spent_at: '2026-11-07',
    custom: {
      shares: [
        { member_id: 1, amount: 200_000 },
        { member_id: 2, amount: 200_000 },
        { member_id: 3, amount: 100_000 },
      ],
      restTo: 1,
      restAmount: 200_000,
      restToPayer: true,
    },
  }
  // "lẩu 500k Tiến trả, Minh 300k, Duy Anh 300k": 600k named, more than the total
  const over = 'Các phần đã nêu cộng lại 600.000đ, hơn tổng 500.000đ. Sửa lại cách chia rồi mới lưu được.'
  const blocked = {
    description: 'Lẩu',
    amount: 500_000,
    payer_id: 1,
    spent_at: '2026-11-07',
    blocked: {
      preview: [
        { member_id: 2, amount: 300_000 },
        { member_id: 3, amount: 300_000 },
      ],
      message: over,
    },
  }
  const differs =
    'Số tiền hoặc người trả trong form khác câu vừa gõ, nên chưa điền phần chia. Bạn tự chia giúp nhé.'

  function setupWithRef() {
    const ref = createRef<ExpenseFormHandle>()
    const result = setup({ ref })
    return { ...result, form: () => ref.current as ExpenseFormHandle }
  }

  test('fills Tự chia, opens it, says who takes the rest, and saves those shares', async () => {
    const { user, onSubmit, form } = setupWithRef()
    let result
    act(() => {
      result = form().fill(custom)
    })

    expect(result).toEqual({ filled: ['description', 'amount', 'payer', 'date', 'split'], kept: [], cleared: [] })
    expect(screen.getByRole('button', { name: 'Tự chia' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Phần của Tiến')).toHaveValue('200000')
    expect(screen.getByLabelText('Phần của Minh')).toHaveValue('200000')
    expect(screen.getByLabelText('Phần của Duy Anh')).toHaveValue('100000')
    expect(plain(screen.getByText(/^Còn lại/).textContent)).toBe('Còn lại 200.000đ tính cho Tiến (người trả).')
    expect(screen.getByText('Đã chia khớp số tiền.')).toBeInTheDocument()

    await save(user)
    expect(onSubmit.mock.calls[0][0].split).toEqual({
      type: 'custom',
      shares: [
        { member_id: 1, amount: 200_000 },
        { member_id: 2, amount: 200_000 },
        { member_id: 3, amount: 100_000 },
      ],
    })
  })

  test('a total typed by hand that differs keeps the split and blocks Lưu', async () => {
    const { user, onSubmit, form } = setupWithRef()
    await user.type(screen.getByLabelText('Số tiền'), '400000')
    let result
    act(() => {
      result = form().fill(custom)
    })

    expect(result).toEqual({ filled: ['description', 'payer', 'date'], kept: ['amount'], cleared: [] })
    expect(screen.getByRole('button', { name: 'Chia đều' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(differs)).toBeInTheDocument()
    await save(user)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(differs)).toHaveClass('field-problem')
  })

  test('a payer chosen by hand blocks a split whose rest went to the payer', async () => {
    const { user, onSubmit, form } = setupWithRef()
    await user.click(payerRadio('Duy Anh'))
    act(() => {
      form().fill(custom)
    })
    expect(screen.getByText(differs)).toBeInTheDocument()
    // Changing only the payer back is not a change of the split: Lưu still waits
    await user.click(payerRadio('Tiến'))
    await save(user)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('a payer chosen by hand does not matter when the rest went to a named person', async () => {
    const { user, form } = setupWithRef()
    await user.click(payerRadio('Duy Anh'))
    act(() => {
      form().fill({ ...custom, custom: { ...custom.custom, restToPayer: false } })
    })
    expect(screen.queryByText(differs)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Phần của Minh')).toHaveValue('200000')
  })

  test('a split set by hand is kept and Lưu waits until it is set again', async () => {
    const { user, onSubmit, form } = setupWithRef()
    await openSplit(user)
    await user.click(screen.getByRole('checkbox', { name: 'Duy Anh' }))
    let result
    act(() => {
      result = form().fill(custom)
    })
    expect(result).toEqual({ filled: ['description', 'amount', 'payer', 'date'], kept: ['split'], cleared: [] })
    expect(screen.getByText(differs)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Duy Anh' }))
    expect(screen.queryByText(differs)).not.toBeInTheDocument()
    await save(user)
    expect(onSubmit).toHaveBeenCalled()
  })

  test('Hoàn tác takes the custom split and its note back', () => {
    const { form } = setupWithRef()
    act(() => {
      form().fill(custom)
    })
    act(() => {
      form().undoFill()
    })
    expect(screen.queryByText(/^Còn lại/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chia đều' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('a share changed after the fill stays the user’s on Hoàn tác', async () => {
    const { user, form } = setupWithRef()
    act(() => {
      form().fill(custom)
    })
    const minh = screen.getByLabelText('Phần của Minh')
    await user.clear(minh)
    await user.type(minh, '150000')
    act(() => {
      form().undoFill()
    })
    expect(screen.getByLabelText('Phần của Minh')).toHaveValue('150000')
  })

  test('blocked amounts are shown as read, and Lưu waits even when they come to add up', async () => {
    const { user, onSubmit, form } = setupWithRef()
    act(() => {
      form().fill(blocked)
    })

    expect(screen.getByText(over)).toBeInTheDocument()
    expect(screen.getByLabelText('Phần của Minh')).toHaveValue('300000')
    expect(screen.getByLabelText('Phần của Duy Anh')).toHaveValue('300000')
    expect(plain(screen.getByText(/Vượt quá/).textContent)).toBe('Vượt quá: 100.000đ')
    await save(user)
    expect(onSubmit).not.toHaveBeenCalled()

    // A total that makes them add up is not a fix of the split
    const amount = screen.getByLabelText('Số tiền')
    await user.clear(amount)
    await user.type(amount, '600000')
    expect(screen.getByText('Đã chia khớp số tiền.')).toBeInTheDocument()
    await save(user)
    expect(onSubmit).not.toHaveBeenCalled()

    // Changing the split itself lifts it
    const minh = screen.getByLabelText('Phần của Minh')
    await user.clear(minh)
    await user.type(minh, '300000')
    expect(screen.queryByText(over)).not.toBeInTheDocument()
    await save(user)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  test('Hoàn tác after a blocked fill lifts the block with the amounts', () => {
    const { form } = setupWithRef()
    act(() => {
      form().fill(blocked)
    })
    act(() => {
      form().undoFill()
    })
    expect(screen.queryByText(over)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chia đều' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('ExpenseForm, Escape closes the folds (DESIGN.md §8)', () => {
  test('Escape in the date fold closes it and focuses Đổi ngày', async () => {
    const { user } = setup()
    await openDate(user)
    await user.click(screen.getByLabelText('Ngày trả'))

    await user.keyboard('{Escape}')

    expect(document.getElementById('expense-date-control')).not.toBeVisible()
    expect(screen.getByRole('button', { name: 'Đổi ngày' })).toHaveFocus()
  })

  test('Escape in the split fold closes it and focuses Sửa cách chia', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Sửa cách chia' }))
    await user.click(screen.getByRole('checkbox', { name: 'Duy Anh' }))

    await user.keyboard('{Escape}')

    expect(document.getElementById('expense-split-control')).not.toBeVisible()
    expect(screen.getByRole('button', { name: 'Sửa cách chia' })).toHaveFocus()
    // Closing is not undoing: the change stays
    await user.click(screen.getByRole('button', { name: 'Sửa cách chia' }))
    expect(screen.getByRole('checkbox', { name: 'Duy Anh' })).not.toBeChecked()
  })
})

// UI review 04/11: the next expense is today's, and the AI clears only the messages of what it filled
test('after a save the next expense is dated today again, whatever the last one was', async () => {
  const { user } = setup()
  await fillBasics(user)
  await openDate(user)
  const date = screen.getByLabelText('Ngày trả')
  await user.clear(date)
  await user.type(date, '2026-10-18')
  await save(user)

  await waitFor(() => expect(screen.getByLabelText('Nội dung')).toHaveValue(''))
  expect(screen.getByText('Hôm nay')).toBeInTheDocument()
})

test('a fill clears the messages of the fields it filled; one still empty keeps its message', async () => {
  const ref = createRef<ExpenseFormHandle>()
  const { user } = setup({ ref })
  await save(user)
  expect(screen.getByText('Nhập nội dung khoản chi.')).toBeInTheDocument()
  expect(screen.getByText('Nhập số tiền.')).toBeInTheDocument()

  act(() => {
    ref.current?.fill({ description: 'Lẩu' })
  })

  expect(screen.queryByText('Nhập nội dung khoản chi.')).not.toBeInTheDocument()
  expect(screen.getByText('Nhập số tiền.')).toBeInTheDocument()
})

// Danh mục (specs/005-expense-categories)
describe('ExpenseForm, the category', () => {
  const categoryValue = () => screen.getByText((_, el) => el?.className === 'fold-value' && el.closest('.fold-row')?.textContent?.startsWith('Danh mục') === true)
  const openCategory = (user: User) => user.click(screen.getByRole('button', { name: /^Đổi danh mục/ }))

  test('follows the description until the user picks one, then stays', async () => {
    const { user, onSubmit } = setup()
    expect(categoryValue()).toHaveTextContent('Khác')
    await user.type(screen.getByLabelText('Nội dung'), 'Mua bóng đèn')
    expect(categoryValue()).toHaveTextContent('Đồ dùng')
    await openCategory(user)
    const group = screen.getByRole('group', { name: 'Danh mục' })
    expect(group.querySelectorAll('button')).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Đồ dùng' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Khác' }))
    // Picking closes the fold and gives the focus back to Đổi
    expect(screen.queryByRole('group', { name: 'Danh mục' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Đổi danh mục, đang là Khác/ })).toHaveFocus()
    await user.type(screen.getByLabelText('Nội dung'), ' và tiền điện')
    expect(categoryValue()).toHaveTextContent('Khác')
    await user.type(screen.getByLabelText('Số tiền'), '50000')
    await save(user)
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ category: 'other' }))
  })

  test('Escape closes the choice and focuses Đổi', async () => {
    const { user } = setup()
    await openCategory(user)
    screen.getByRole('button', { name: 'Ăn uống' }).focus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Danh mục' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Đổi danh mục/ })).toHaveFocus()
  })

  test('editing keeps the stored category, whatever the description says', async () => {
    const stored: Expense = {
      id: 5,
      household_id: 7,
      description: 'Tiền điện',
      amount: 450_000,
      payer_id: 1,
      spent_at: '2026-11-03',
      source: 'manual',
      category: 'rent',
      created_at: '',
      split_type: 'equal',
      shares: [1, 2, 3].map((member_id) => ({ member_id, amount: 150_000 })),
    }
    const { user, onSubmit } = setup({ initial: stored })
    expect(categoryValue()).toHaveTextContent('Tiền nhà')
    await user.type(screen.getByLabelText('Nội dung'), ' tháng 11')
    expect(categoryValue()).toHaveTextContent('Tiền nhà')
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ category: 'rent' }))
  })

  test('after a save the next expense guesses again', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Nội dung'), 'Lẩu')
    await openCategory(user)
    await user.click(screen.getByRole('button', { name: 'Đi chợ' }))
    await user.type(screen.getByLabelText('Số tiền'), '90000')
    await save(user)
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'groceries' }))
    await waitFor(() => expect(screen.getByLabelText('Nội dung')).toHaveValue(''))
    await user.type(screen.getByLabelText('Nội dung'), 'Đổ xăng')
    expect(categoryValue()).toHaveTextContent('Đi lại')
  })
})

// Khoản chi định kỳ (specs/007-recurring-expenses)
describe('ExpenseForm, recurring', () => {
  const tick = () => screen.getByRole('checkbox', { name: 'Lặp lại hằng tháng' })

  test('Lặp lại hằng tháng: off, names the day, then offers a varying amount; the input says so', async () => {
    const { user, onSubmit } = setup()
    expect(tick()).not.toBeChecked()
    expect(screen.queryByRole('checkbox', { name: 'Số tiền thay đổi mỗi tháng' })).not.toBeInTheDocument()
    await fillBasics(user, '300k')
    await user.click(tick())
    const day = Number(new Date().getDate())
    expect(screen.getByText(`Nhắc ngày ${day} hằng tháng · không tự lưu khoản chi`)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Số tiền thay đổi mỗi tháng' }))
    await save(user)
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ recurring: { varying_amount: true } }))
    // Ready for the next expense: not ticked any more
    await waitFor(() => expect(tick()).not.toBeChecked())
  })

  test('without the tick nothing recurs', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user)
    await save(user)
    const input = onSubmit.mock.calls[0][0]
    expect(input).not.toHaveProperty('recurring')
    expect(input).not.toHaveProperty('recurring_item_id')
  })

  test('a custom split cannot recur: it says so and does not save', async () => {
    const { user, onSubmit } = setup()
    await fillBasics(user, '300000')
    await openSplit(user)
    await user.click(screen.getByRole('button', { name: 'Tự chia' }))
    const inputs = screen.getAllByRole('textbox', { name: /^Phần của/ })
    await user.type(inputs[0], '200000')
    await user.type(inputs[1], '100000')
    await user.click(tick())
    await save(user)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/Khoản định kỳ chỉ chia đều/)).toBeInTheDocument()
  })

  test('not offered when editing', () => {
    setup({
      initial: {
        id: 5, household_id: 7, description: 'Tiền nhà', amount: 300_000, payer_id: 1, spent_at: '2026-11-01',
        source: 'manual', category: 'rent', created_at: '', split_type: 'equal',
        shares: [1, 2, 3].map((member_id) => ({ member_id, amount: 100_000 })),
      },
    })
    expect(screen.queryByRole('checkbox', { name: 'Lặp lại hằng tháng' })).not.toBeInTheDocument()
  })

  const item = (overrides: Partial<RecurringItem> = {}): RecurringItem => ({
    id: 7, household_id: 7, description: 'Tiền nhà', category: 'rent', payer_id: 2, member_ids: [1, 2, 3],
    amount: 4_500_000, day: 1, created_by: 10, created_at: '', ...overrides,
  })

  test('filled from a due item: its fields, today, the period, no tick; the input names the item', async () => {
    const { user, onSubmit } = setup({ fromItem: item() })
    expect(screen.getByLabelText('Nội dung')).toHaveValue('Tiền nhà')
    expect(screen.getByLabelText('Số tiền')).toHaveValue('4500000')
    expect(payer()).toBe('2')
    const month = new Date()
    expect(screen.getByText(`Đang ghi kỳ ${month.getMonth() + 1}/${month.getFullYear()}`)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Lặp lại hằng tháng' })).not.toBeInTheDocument()
    await save(user)
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Tiền nhà',
        amount: 4_500_000,
        payer_id: 2,
        category: 'rent',
        source: 'manual',
        recurring_item_id: 7,
        split: { type: 'equal', member_ids: [1, 2, 3] },
      }),
    )
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('recurring')
  })

  test('the period follows the date', async () => {
    const { user } = setup({ fromItem: item() })
    await openDate(user)
    const date = screen.getByLabelText('Ngày trả')
    await user.clear(date)
    await user.type(date, '2026-12-03')
    expect(screen.getByText('Đang ghi kỳ 12/2026')).toBeInTheDocument()
  })

  test('a varying item opens with the amount empty and focused', () => {
    setup({ fromItem: item({ amount: null, description: 'Tiền điện' }) })
    expect(screen.getByLabelText('Số tiền')).toHaveValue('')
    expect(screen.getByLabelText('Số tiền')).toHaveFocus()
  })

  test('people no longer in the house are left out and named; a payer who left is left to pick', () => {
    const withRoles = [
      { ...members[0], role: 'owner' as const },
      { ...members[1], role: null },
      { ...members[2], role: 'member' as const },
    ]
    setup({ members: withRoles, fromItem: item() })
    expect(screen.getByText('Minh không còn trong nhà nên không được tính vào phần chia.')).toBeInTheDocument()
    expect(screen.getByText('Người trả lần trước không còn trong nhà. Chọn người trả cho lần này.')).toBeInTheDocument()
    expect(payer()).toBe('')
  })
})
