import { describe, expect, test } from 'vitest'

import type { ExpenseDraft } from '../api/types'
import { draftToFill } from './draftFill'

const base: ExpenseDraft = {
  description: 'Lẩu',
  amount: 500_000,
  payer_id: 1,
  spent_at: '2026-11-07',
  source: 'ai',
  split: { type: 'equal', member_ids: [1, 2] },
}

describe('draftToFill', () => {
  test('an equal split fills the people, with the note when the AI assumed everyone', () => {
    const fill = draftToFill(base, [{ code: 'participants_assumed', message: '' }])
    expect(fill.member_ids).toEqual([1, 2])
    expect(fill.splitNote).toBe('AI chia cho cả nhà, bạn kiểm tra lại.')
    expect(fill.custom).toBeUndefined()
  })

  test('a custom split goes through with who took the rest', () => {
    const shares = [
      { member_id: 1, amount: 300_000 },
      { member_id: 2, amount: 200_000 },
    ]
    const fill = draftToFill(
      { ...base, split: { type: 'custom', shares, rest_to: 1, rest_amount: 300_000, rest_to_payer: true } },
      [],
    )
    expect(fill.custom).toEqual({ shares, restTo: 1, restAmount: 300_000, restToPayer: true })
    expect(fill.member_ids).toBeUndefined()
  })

  test('a blocked split carries the amounts as read and the reason in words', () => {
    const preview = [{ member_id: 2, amount: 600_000 }]
    const fill = draftToFill(
      { ...base, split: { type: 'blocked', reason: 'no_total', preview } },
      [{ code: 'no_total', message: 'Type the total' }],
    )
    expect(fill.blocked).toEqual({ preview, message: 'Nhập tổng số tiền rồi chia lại.' })
  })
})
