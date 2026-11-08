import { act, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import type { Member } from '../api/types'
import ExpenseForm from './ExpenseForm'
import type { ExpenseFormHandle } from './ExpenseForm'

// specs/011-first-impressions: the save summary (US1), the repeat lock (US3), large amounts and the
// share prefill (US4)

const members: Member[] = [
  { id: 1, household_id: 7, name: 'Tiến', created_at: '' },
  { id: 2, household_id: 7, name: 'Minh', created_at: '' },
  { id: 3, household_id: 7, name: 'Duy Anh', created_at: '' },
]

type User = ReturnType<typeof userEvent.setup>
type Props = Partial<Parameters<typeof ExpenseForm>[0]>

function setup(props: Props = {}, people: Member[] = members) {
  const onSubmit = vi.fn().mockResolvedValue({})
  const ref = createRef<ExpenseFormHandle>()
  const base = { members: people, me: people[0].id, defaultPayer: people[0].id, onSubmit, submitting: false, ref }
  const view = render(<ExpenseForm {...base} {...props} />)
  const rerender = (next: Props) => view.rerender(<ExpenseForm {...base} {...props} {...next} />)
  return {
    onSubmit: (props.onSubmit as typeof onSubmit) ?? onSubmit,
    user: userEvent.setup(),
    form: () => ref.current as ExpenseFormHandle,
    rerender,
  }
}

const summary = () => document.querySelector('.form-actions .form-summary')
const save = (user: User) => user.click(screen.getByRole('button', { name: 'Lưu khoản chi' }))
const openSplit = (user: User) => user.click(screen.getByRole('button', { name: 'Sửa cách chia' }))
const share = (name: string) => screen.getByLabelText(`Phần của ${name}`)
async function basics(user: User, amount = '240000', description = 'Đi chợ') {
  await user.type(screen.getByLabelText('Nội dung'), description)
  await user.type(screen.getByLabelText('Số tiền'), amount)
}
async function custom(user: User) {
  await openSplit(user)
  await user.click(screen.getByRole('button', { name: 'Tự chia' }))
}

describe('US1: a failed save says why, where you can see it', () => {
  test('shares that do not add up: the summary is in the save area and the first share is focused', async () => {
    const { user, onSubmit } = setup()
    await basics(user)
    await custom(user)
    await user.clear(share('Duy Anh'))
    await save(user)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(summary()).toHaveTextContent('Chưa lưu được: Tổng các phần phải bằng đúng số tiền của khoản chi.')
    expect(share('Tiến')).toHaveFocus()
  })

  test('an unreadable share is the one that gets the focus', async () => {
    const { user } = setup()
    await basics(user)
    await custom(user)
    await user.clear(share('Minh'))
    await user.type(share('Minh'), 'abc')
    await save(user)
    expect(share('Minh')).toHaveFocus()
  })

  test('Chia đều with nobody ticked focuses the first person', async () => {
    const { user } = setup()
    await basics(user)
    await openSplit(user)
    for (const name of ['Tiến', 'Minh', 'Duy Anh']) await user.click(screen.getByRole('checkbox', { name }))
    await save(user)
    expect(screen.getByRole('checkbox', { name: 'Tiến' })).toHaveFocus()
  })

  test('the summary follows edits after a failed save, and goes when the form is valid', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Số tiền'), 'abc')
    await save(user)
    expect(summary()).toHaveTextContent('Chưa lưu được: Nhập nội dung khoản chi.')
    expect(screen.getByLabelText('Nội dung')).toHaveFocus()
    await user.type(screen.getByLabelText('Nội dung'), 'Lẩu')
    // Still wrong: the amount, so the summary moves on instead of vanishing
    expect(summary()).toHaveTextContent(/^Chưa lưu được: Số tiền chưa hợp lệ/)
    await user.clear(screen.getByLabelText('Số tiền'))
    await user.type(screen.getByLabelText('Số tiền'), '240000')
    expect(summary()).toBeEmptyDOMElement()
  })

  test('a server refusal about a field focuses it; a general failure only shows in the summary', async () => {
    const { user, rerender } = setup()
    await basics(user)
    rerender({ serverError: { message: 'Có người không thuộc nhà này.', field: 'payer' } })
    expect(summary()).toHaveTextContent('Chưa lưu được: Có người không thuộc nhà này.')
    expect(screen.getByRole('radio', { name: /^Tiến/ })).toHaveFocus()

    screen.getByLabelText('Nội dung').focus()
    rerender({ serverError: { message: 'Không kết nối được.', field: null } })
    expect(summary()).toHaveTextContent('Chưa lưu được: Không kết nối được.')
    expect(summary()).toHaveAttribute('role', 'status')
    expect(screen.getByLabelText('Nội dung')).toHaveFocus()
  })

  test('a server message goes when its field changes, and nothing typed is lost', async () => {
    const { user, rerender } = setup()
    await basics(user)
    rerender({ serverError: { message: 'Số tiền không hợp lệ.', field: 'amount' } })
    expect(summary()).toHaveTextContent('Số tiền không hợp lệ.')
    await user.type(screen.getByLabelText('Số tiền'), '0')
    expect(summary()).toBeEmptyDOMElement()
    expect(screen.getByLabelText('Nội dung')).toHaveValue('Đi chợ')
  })

  test('a lost connection stays while the amount is edited; a split refusal goes with it', async () => {
    const { user, rerender } = setup()
    await basics(user)
    rerender({ serverError: { message: 'Không kết nối được.', field: null } })
    await user.type(screen.getByLabelText('Số tiền'), '0')
    expect(summary()).toHaveTextContent('Chưa lưu được: Không kết nối được.')
    rerender({ serverError: { message: 'Có người không thuộc nhà này.', field: 'split' } })
    await user.type(screen.getByLabelText('Số tiền'), '0')
    expect(summary()).toBeEmptyDOMElement()
  })
})

describe('US3: repeating monthly and Tự chia cannot clash', () => {
  const repeatBox = () => screen.getByRole('checkbox', { name: 'Lặp lại hằng tháng' })

  test('switching to Tự chia unticks and locks repeat, with the reason', async () => {
    const { user } = setup()
    await basics(user)
    await user.click(repeatBox())
    await custom(user)
    expect(repeatBox()).not.toBeChecked()
    expect(repeatBox()).toBeDisabled()
    expect(repeatBox()).toHaveAccessibleDescription('Khoản định kỳ chỉ chia đều được.')
    await user.click(screen.getByRole('button', { name: 'Chia đều' }))
    expect(repeatBox()).toBeEnabled()
    expect(repeatBox()).not.toBeChecked()
  })

  test('a quick-add fill with a custom split locks it too, and undo gives repeat back', async () => {
    const { user, form } = setup()
    await user.click(repeatBox())
    act(() => {
      form().fill({
        description: 'Lẩu',
        amount: 300_000,
        payer_id: 1,
        custom: { shares: [{ member_id: 1, amount: 200_000 }, { member_id: 2, amount: 100_000 }], restTo: null, restAmount: 0, restToPayer: false },
      })
    })
    expect(repeatBox()).not.toBeChecked()
    expect(repeatBox()).toBeDisabled()
    act(() => {
      form().undoFill()
    })
    expect(repeatBox()).toBeChecked()
  })
})

describe('US4: large amounts', () => {
  const confirmText = () => document.querySelector('.form-confirm')

  test('above 50.000.000đ the save area asks once; Lưu thật saves once', async () => {
    const { user, onSubmit } = setup()
    await basics(user, '50000001')
    await save(user)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(confirmText()).toHaveTextContent('Số tiền 50.000.001đ lớn bất thường. Lưu thật nhé?')
    expect(screen.getByRole('button', { name: 'Sửa lại' })).toHaveFocus()
    // The question is read with whichever button has the focus
    const question = 'Số tiền 50.000.001đ lớn bất thường. Lưu thật nhé?'
    expect(screen.getByRole('button', { name: 'Sửa lại' })).toHaveAccessibleDescription(question)
    expect(screen.getByRole('button', { name: 'Lưu thật' })).toHaveAccessibleDescription(question)
    await user.click(screen.getByRole('button', { name: 'Lưu thật' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  test('editing a large expense without changing its amount does not ask; a new amount does', async () => {
    const { user, onSubmit } = setup({
      initial: {
        id: 9, household_id: 7, description: 'Máy lạnh', amount: 60_000_000, payer_id: 1, spent_at: '2026-11-01',
        source: 'manual', category: 'other', created_at: '', split_type: 'equal',
        shares: [{ member_id: 1, amount: 30_000_000 }, { member_id: 2, amount: 30_000_000 }],
      },
    })
    await user.type(screen.getByLabelText('Nội dung'), ' mới')
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    await user.clear(screen.getByLabelText('Số tiền'))
    await user.type(screen.getByLabelText('Số tiền'), '70tr')
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(confirmText()).not.toBeNull()
  })

  test('Escape or Sửa lại goes back to the amount without saving', async () => {
    const { user, onSubmit } = setup()
    await basics(user, '60tr')
    await save(user)
    await user.keyboard('{Escape}')
    expect(confirmText()).toBeNull()
    expect(screen.getByLabelText('Số tiền')).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('Enter in a field never saves while the question shows', async () => {
    const { user, onSubmit } = setup()
    await basics(user, '60tr')
    await save(user)
    screen.getByLabelText('Nội dung').focus()
    await user.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(confirmText()).not.toBeNull()
  })

  test('the same amount written another way is not asked again; another large amount is', async () => {
    const { user, onSubmit } = setup({ onSubmit: vi.fn().mockRejectedValue(new Error('500')) })
    await basics(user, '60tr')
    await save(user)
    await user.click(screen.getByRole('button', { name: 'Lưu thật' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    // The save failed: the same amount, typed as digits, saves without asking again
    await user.clear(screen.getByLabelText('Số tiền'))
    await user.type(screen.getByLabelText('Số tiền'), '60.000.000')
    await save(user)
    expect(onSubmit).toHaveBeenCalledTimes(2)
    await user.clear(screen.getByLabelText('Số tiền'))
    await user.type(screen.getByLabelText('Số tiền'), '70tr')
    await save(user)
    expect(onSubmit).toHaveBeenCalledTimes(2)
    expect(confirmText()).not.toBeNull()
  })

  test('50.000.000đ is never asked about; above 1.000.000.000.000đ is refused first', async () => {
    const { user, onSubmit } = setup()
    await basics(user, '50000000')
    await save(user)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    await basics(user, '2000000000000', 'Nhà')
    await save(user)
    expect(confirmText()).toBeNull()
    expect(screen.getByLabelText('Số tiền')).toHaveAccessibleDescription(/tối đa 1\.000\.000\.000\.000đ/)
  })

  test('a quick-add fill of a large amount never opens the question by itself', () => {
    const { form } = setup()
    act(() => {
      form().fill({ description: 'Tiền nhà', amount: 60_000_000, payer_id: 1, member_ids: [1, 2, 3] })
    })
    expect(confirmText()).toBeNull()
  })
})

describe('US4: Tự chia starts at the equal split, once', () => {
  const odd: Member[] = [
    { id: 9, household_id: 7, name: 'Chín', created_at: '' },
    { id: 2, household_id: 7, name: 'Hai', created_at: '' },
    { id: 5, household_id: 7, name: 'Năm', created_at: '' },
  ]

  test('10đ for members 9, 2, 5 starts at 3, 4, 3: the extra đồng to the lowest id', async () => {
    const { user } = setup({}, odd)
    await basics(user, '10')
    await custom(user)
    expect(share('Chín')).toHaveValue('3')
    expect(share('Hai')).toHaveValue('4')
    expect(share('Năm')).toHaveValue('3')
  })

  test('without a total the shares wait, then fill once the total is typed', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Nội dung'), 'Lẩu')
    await custom(user)
    expect(share('Tiến')).toHaveValue('')
    await user.type(screen.getByLabelText('Số tiền'), '300000')
    // Not on each keystroke ("3" would split 3 đồng): once the person leaves the amount field
    expect(share('Tiến')).toHaveValue('')
    await user.tab()
    expect(share('Tiến')).toHaveValue('100000')
    expect(share('Duy Anh')).toHaveValue('100000')
  })

  test('a share typed before the total is never overwritten', async () => {
    const { user } = setup()
    await custom(user)
    await user.type(share('Minh'), '50000')
    await user.type(screen.getByLabelText('Số tiền'), '300000')
    await user.tab()
    expect(share('Minh')).toHaveValue('50000')
    expect(share('Tiến')).toHaveValue('')
  })

  test('a new total after the prefill keeps the shares and shows what is left', async () => {
    const { user } = setup()
    await basics(user, '300000')
    await custom(user)
    await user.clear(screen.getByLabelText('Số tiền'))
    await user.type(screen.getByLabelText('Số tiền'), '330000')
    expect(share('Tiến')).toHaveValue('100000')
    expect(screen.getByText(/^Chưa chia/)).toHaveTextContent('30.000')
  })

  test('back and forth keeps typed shares and never prefills twice', async () => {
    const { user } = setup()
    await basics(user, '300000')
    await custom(user)
    await user.clear(share('Tiến'))
    await user.type(share('Tiến'), '200000')
    await user.click(screen.getByRole('button', { name: 'Chia đều' }))
    await user.click(screen.getByRole('button', { name: 'Tự chia' }))
    expect(share('Tiến')).toHaveValue('200000')
  })

  test('an expense being edited keeps its own shares', async () => {
    const { user } = setup({
      initial: {
        id: 9, household_id: 7, description: 'Ăn tối', amount: 240_000, payer_id: 2, spent_at: '2026-10-18',
        source: 'manual', category: 'other', created_at: '', split_type: 'custom',
        shares: [{ member_id: 2, amount: 240_000 }],
      },
    })
    await openSplit(user)
    expect(share('Minh')).toHaveValue('240000')
    expect(share('Tiến')).toHaveValue('')
  })

  test('each share shows its amount like the total, and an unreadable one says so', async () => {
    const { user } = setup()
    await basics(user, '300000')
    await custom(user)
    await user.clear(share('Tiến'))
    await user.type(share('Tiến'), '120k')
    expect(share('Tiến')).toHaveAccessibleDescription('= 120.000đ')
    await user.clear(share('Minh'))
    await user.type(share('Minh'), 'abc')
    expect(share('Minh')).toHaveAccessibleDescription(/^Số tiền chưa hợp lệ/)
  })
})

describe('one save at a time', () => {
  test('a double click or Enter pressed again while saving sends one expense', async () => {
    let finish: () => void = () => {}
    const { user, onSubmit } = setup({ onSubmit: vi.fn(() => new Promise<void>((resolve) => (finish = resolve))) })
    await basics(user)
    await user.dblClick(screen.getByRole('button', { name: 'Lưu khoản chi' }))
    await user.type(screen.getByLabelText('Nội dung'), '{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    await act(async () => finish())
    // Saved: the next one goes out
    await basics(user, '60000', 'Trà sữa')
    await save(user)
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  test('a failed save frees it: pressing Lưu again sends again', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue({})
    const { user } = setup({ onSubmit })
    await basics(user)
    await save(user)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    await save(user)
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })
})

// Accessibility pass of specs/011: a disabled button drops the keyboard focus to the page
describe('the save button keeps the focus', () => {
  test('while saving it is aria-disabled, not disabled, and a failed save leaves the focus on it', async () => {
    let fail: () => void = () => {}
    const onSubmit = vi.fn(() => new Promise<void>((_resolve, reject) => (fail = () => reject(new Error('network')))))
    const { user, rerender } = setup({ onSubmit })
    await basics(user)
    await save(user)
    rerender({ onSubmit, submitting: true })
    const button = screen.getByRole('button', { name: 'Đang lưu…' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toBeEnabled()
    expect(button).toHaveFocus()
    // Pressed again while it waits: nothing more is sent
    await user.click(button)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    await act(async () => fail())
    rerender({ onSubmit, submitting: false })
    expect(screen.getByRole('button', { name: 'Lưu khoản chi' })).toHaveFocus()
  })

  test('after Lưu thật the focus is on the save button that takes its place', async () => {
    const { user } = setup({ onSubmit: vi.fn().mockRejectedValue(new Error('network')) })
    await basics(user, '60tr')
    await save(user)
    await user.click(screen.getByRole('button', { name: 'Lưu thật' }))
    expect(screen.getByRole('button', { name: 'Lưu khoản chi' })).toHaveFocus()
  })
})
