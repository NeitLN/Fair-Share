import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ApiError } from '../api/client'
import type { AiDraft, Member } from '../api/types'
import AiComposer from './AiComposer'

const members: Member[] = [
  { id: 1, household_id: 7, name: 'Tiến', created_at: '' },
  { id: 2, household_id: 7, name: 'Minh', created_at: '' },
]

const answer: AiDraft = {
  draft: {
    description: 'Lẩu',
    amount: 240_000,
    payer_id: 2,
    spent_at: '2026-10-21',
    source: 'ai',
    split: { type: 'equal', member_ids: [1, 2] },
  },
  warnings: [],
}

// Intl puts a non-breaking space before ₫
const plain = (text: string | null | undefined) => (text ?? '').replace(/[\u00A0\u202F]/g, ' ')

function setup(onParse: (text: string) => Promise<AiDraft>, kept: string[] = []) {
  const props = {
    members,
    onParse: vi.fn(onParse),
    onDraft: vi.fn(() => ({ filled: [], kept }) as never),
    onUndo: vi.fn(),
    onManual: vi.fn(),
  }
  render(<AiComposer {...props} />)
  return props
}

afterEach(() => {
  vi.useRealTimers()
})

describe('AiComposer', () => {
  test('idle: a hint, and the button waits for a sentence', () => {
    setup(() => Promise.resolve(answer))
    expect(screen.getByText('AI điền form bên dưới, bạn duyệt rồi mới lưu.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Điền giúp' })).toBeDisabled()
  })

  test('a draft fills the form and says what was filled', async () => {
    const props = setup(() => Promise.resolve(answer))
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Câu mô tả khoản chi'), 'lẩu 240k Minh trả chia đều')
    await user.click(screen.getByRole('button', { name: 'Điền giúp' }))

    expect(props.onParse).toHaveBeenCalledWith('lẩu 240k Minh trả chia đều')
    expect(props.onDraft).toHaveBeenCalledWith(answer.draft)
    const note = await screen.findByText(/^Đã điền:/)
    expect(plain(note.textContent)).toBe('Đã điền: Lẩu · 240.000 ₫ · Minh trả · chia đều cả nhà (2 người).')
  })

  test('says which fields it left as the user typed them', async () => {
    setup(() => Promise.resolve(answer), ['amount'])
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Câu mô tả khoản chi'), 'lẩu 240k')
    await user.click(screen.getByRole('button', { name: 'Điền giúp' }))

    expect(await screen.findByText('Giữ nguyên số tiền bạn đã nhập.')).toBeInTheDocument()
  })

  test('warnings from the API are shown in Vietnamese', async () => {
    setup(() =>
      Promise.resolve({
        ...answer,
        warnings: [
          { code: 'unknown_member', name: 'Hùng', message: '"Hùng" is not a member of this household' },
          { code: 'no_amount', message: 'Type the amount' },
        ],
      }),
    )
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Câu mô tả khoản chi'), 'Hùng trả tiền lẩu')
    await user.click(screen.getByRole('button', { name: 'Điền giúp' }))

    expect(await screen.findByText('“Hùng” không có trong nhà. Chọn người ở form.')).toBeInTheDocument()
    expect(screen.getByText('AI chưa thấy số tiền, hãy nhập số tiền.')).toBeInTheDocument()
  })

  test('"Hoàn tác điền" asks the form to undo the fill', async () => {
    const props = setup(() => Promise.resolve(answer))
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Câu mô tả khoản chi'), 'lẩu 240k')
    await user.click(screen.getByRole('button', { name: 'Điền giúp' }))
    await user.click(await screen.findByRole('button', { name: 'Hoàn tác điền' }))

    expect(props.onUndo).toHaveBeenCalledOnce()
    expect(screen.queryByText(/^Đã điền:/)).not.toBeInTheDocument()
  })

  test('when the AI is busy the sentence stays, and "Thử lại" asks again', async () => {
    let calls = 0
    const props = setup(() => {
      calls += 1
      return calls === 1
        ? Promise.reject(new ApiError(429, 'ai_rate_limited', 'AI quick add is busy right now'))
        : Promise.resolve(answer)
    })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Câu mô tả khoản chi'), 'lẩu 240k')
    await user.click(screen.getByRole('button', { name: 'Điền giúp' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'AI đang bận. Câu bạn gõ vẫn còn, điền form bên dưới là lưu được ngay.',
    )
    expect(screen.getByLabelText('Câu mô tả khoản chi')).toHaveValue('lẩu 240k')
    expect(props.onDraft).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText(/^Đã điền:/)).toBeInTheDocument()
    expect(props.onParse).toHaveBeenCalledTimes(2)
  })

  test('an AI that is not available gets the same calm message', async () => {
    setup(() => Promise.reject(new ApiError(503, 'ai_unavailable', 'not available')))
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Câu mô tả khoản chi'), 'lẩu 240k')
    await user.click(screen.getByRole('button', { name: 'Điền giúp' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('AI đang bận.')
  })

  test('while reading it counts the seconds and offers "Nhập tay"', async () => {
    // Only the clock the counter uses; typing and clicking keep real timers
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    setup(() => new Promise<AiDraft>(() => {})) // never answers
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Câu mô tả khoản chi'), 'lẩu 240k')
    await user.click(screen.getByRole('button', { name: 'Điền giúp' }))

    act(() => {
      vi.advanceTimersByTime(6_000)
    })
    expect(screen.getByText(/AI đang đọc… 6 giây · thường mất 10–20 giây/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Điền giúp' })).toBeDisabled()
  })

  test('"Nhập tay" stops waiting, and a late answer never overwrites the form', async () => {
    let answerNow: (value: AiDraft) => void = () => {}
    const props = setup(() => new Promise<AiDraft>((resolve) => (answerNow = resolve)))
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Câu mô tả khoản chi'), 'lẩu 240k')
    await user.click(screen.getByRole('button', { name: 'Điền giúp' }))
    await user.click(screen.getByRole('button', { name: 'Nhập tay' }))

    expect(props.onManual).toHaveBeenCalledOnce()
    await act(async () => answerNow(answer))
    expect(props.onDraft).not.toHaveBeenCalled()
    expect(screen.queryByText(/^Đã điền:/)).not.toBeInTheDocument()
  })

  test('Enter reads the sentence', async () => {
    const props = setup(() => Promise.resolve(answer))
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Câu mô tả khoản chi'), 'lẩu 240k{Enter}')
    expect(props.onParse).toHaveBeenCalledWith('lẩu 240k')
  })
})
