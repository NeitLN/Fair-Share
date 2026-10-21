import { describe, expect, test } from 'vitest'

import type { ExpenseDraft, Member } from '../api/types'
import { draftSummary } from './draftSummary'
import { formatVND } from './money'

const members: Member[] = [
  { id: 1, household_id: 7, name: 'Minh', created_at: '2026-10-01T00:00:00Z' },
  { id: 2, household_id: 7, name: 'Tiến', created_at: '2026-10-02T00:00:00Z' },
  { id: 3, household_id: 7, name: 'An', created_at: '2026-10-03T00:00:00Z' },
  { id: 4, household_id: 7, name: 'Hương', created_at: '2026-10-04T00:00:00Z' },
]

const draft: ExpenseDraft = {
  description: 'Lẩu',
  amount: 240000,
  payer_id: 1,
  spent_at: '2026-10-21',
  source: 'ai',
  split: { type: 'equal', member_ids: [1, 2, 3, 4] },
}

describe('draftSummary', () => {
  test('a split that was not applied is not mentioned', () => {
    expect(draftSummary({ ...draft, split: { type: 'equal', member_ids: [] } }, members)).toBe(
      `Đã điền: Lẩu · ${formatVND(240000)} · Minh trả.`,
    )
  })

  test('nothing applied gives an empty summary', () => {
    const nothing = { ...draft, description: '', amount: null, payer_id: null }
    expect(draftSummary({ ...nothing, split: { type: 'equal', member_ids: [] } }, members)).toBe('')
  })

  test('describes a complete draft for the whole household', () => {
    expect(draftSummary(draft, members)).toBe(
      `Đã điền: Lẩu · ${formatVND(240000)} · Minh trả · chia đều cả nhà (4 người).`,
    )
  })

  test('leaves out the amount when the draft has none', () => {
    expect(draftSummary({ ...draft, amount: null }, members)).toBe(
      'Đã điền: Lẩu · Minh trả · chia đều cả nhà (4 người).',
    )
  })

  test('leaves out the payer when the draft has none', () => {
    expect(draftSummary({ ...draft, payer_id: null }, members)).toBe(
      `Đã điền: Lẩu · ${formatVND(240000)} · chia đều cả nhà (4 người).`,
    )
  })

  test('names the payer, and says "deleted" when they are no longer a member', () => {
    expect(draftSummary({ ...draft, payer_id: 2 }, members)).toContain('Tiến trả')
    expect(draftSummary({ ...draft, payer_id: 99 }, members)).toContain('Thành viên đã xoá trả')
  })

  test('counts the participants when only some of the household shares it', () => {
    expect(draftSummary({ ...draft, split: { type: 'equal', member_ids: [1, 2] } }, members)).toBe(
      `Đã điền: Lẩu · ${formatVND(240000)} · Minh trả · chia đều 2 người.`,
    )
  })

  test('treats the same members in any order as the whole household', () => {
    expect(draftSummary({ ...draft, split: { type: 'equal', member_ids: [4, 2, 1, 3] } }, members)).toBe(
      `Đã điền: Lẩu · ${formatVND(240000)} · Minh trả · chia đều cả nhà (4 người).`,
    )
  })
})
