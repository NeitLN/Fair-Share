import { describe, expect, test } from 'vitest'

import { ApiError } from '../api/client'
import en from '../i18n/en'
import vi from '../i18n/vi'
import { outcomeLine, outcomeOf } from './saveOutcome'
import type { SaveAction } from './saveOutcome'

const offline = new ApiError(0, 'offline', 'x')
const unknown = new ApiError(0, 'outcome_unknown', 'x')

describe('outcomeOf (specs/018, research R4)', () => {
  test('tells the three cases apart', () => {
    expect(outcomeOf(offline)).toBe('offline')
    expect(outcomeOf(unknown)).toBe('unknown')
    expect(outcomeOf(new ApiError(0, 'network_error', 'x'))).toBe('other')
    expect(outcomeOf(new ApiError(409, 'notice_changed', 'x'))).toBe('other')
    expect(outcomeOf(new Error('x'))).toBe('other')
    expect(outcomeOf(null)).toBe('other')
  })
})

describe('outcomeLine (contracts/ui-contract.md §2)', () => {
  test('the exact lines, in Vietnamese', () => {
    expect(outcomeLine('A1', offline, vi)).toBe('Chưa lưu được: bạn đang mất mạng. Khoản chi này chưa được lưu.')
    expect(outcomeLine('A1', unknown, vi)).toBe(
      // Pressing again is safe since specs/020-no-double-save (US4)
      'Chưa nhận được kết quả. Có thể khoản chi đã được lưu; bấm Lưu lại cũng không ghi trùng.',
    )
    expect(outcomeLine('A2', unknown, vi)).toBe(
      'Chưa nhận được kết quả. Có thể khoản trả đã được ghi; bấm lại cũng không ghi trùng.',
    )
    expect(outcomeLine('A5', unknown, vi)).toBe(outcomeLine('A2', unknown, vi))
    expect(outcomeLine('A4', offline, vi)).toBe('Chưa huỷ được: bạn đang mất mạng.')
    expect(outcomeLine('A7', unknown, vi)).toBe(
      'Chưa nhận được kết quả. Có thể đã xoá rồi, xem lại danh sách trước khi xoá lại.',
    )
  })

  test('every action has both lines in both languages, and an unknown line never says it failed', () => {
    for (const action of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'] as SaveAction[]) {
      for (const t of [vi, en]) {
        expect(outcomeLine(action, offline, t)).toBeTruthy()
        const line = outcomeLine(action, unknown, t) ?? ''
        expect(line).toMatch(/^(Chưa nhận được kết quả|No answer yet)/)
        expect(line).not.toMatch(/Chưa lưu được|Not saved|Couldn't/)
      }
    }
  })

  test("other failures keep today's message", () => {
    expect(outcomeLine('A1', new ApiError(422, 'validation_error', 'x'), vi)).toBeNull()
  })
})
