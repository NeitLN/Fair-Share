import { describe, expect, test } from 'vitest'

import type { Expense, Member } from '../api/types'
import { expensesCsv, fileSlug, toCsv } from './csv'

const members: Member[] = [
  { id: 1, household_id: 7, name: 'Nguyễn Duy Anh', created_at: '' },
  { id: 2, household_id: 7, name: 'Trần Thị Bích', created_at: '' },
]

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 1,
    household_id: 7,
    description: 'Lẩu',
    amount: 240_000,
    payer_id: 1,
    spent_at: '2026-10-21',
    source: 'manual',
    created_at: '',
    split_type: 'equal',
    shares: [
      { member_id: 1, amount: 120_000 },
      { member_id: 2, amount: 120_000 },
    ],
    ...overrides,
  }
}

const header = 'Ngày,Nội dung,Số tiền (đồng),Người trả,Cách chia,Nguyễn Duy Anh,Trần Thị Bích'

describe('toCsv', () => {
  test('joins cells with commas and rows with CRLF, without a trailing break', () => {
    expect(toCsv([['a', 1], ['b', 2]])).toBe('a,1\r\nb,2')
  })

  test('writes integers as plain digits', () => {
    expect(toCsv([[240_000]])).toBe('240000')
  })

  test('quotes a cell with a comma, a quote or a line break', () => {
    expect(toCsv([['a,b', 'say "hi"', 'line 1\nline 2', 'cr\rhere']])).toBe(
      '"a,b","say ""hi""","line 1\nline 2","cr\rhere"',
    )
  })
})

describe('expensesCsv', () => {
  test('writes only the header when there are no expenses', () => {
    expect(expensesCsv([], members)).toBe(header)
  })

  test('oldest day first, then the lower id', () => {
    const csv = expensesCsv(
      [
        expense({ id: 3, description: 'C', spent_at: '2026-10-22' }),
        expense({ id: 2, description: 'B', spent_at: '2026-10-20' }),
        expense({ id: 1, description: 'A', spent_at: '2026-10-20' }),
      ],
      members,
    )

    expect(csv.split('\r\n').slice(1).map((line) => line.split(',')[1])).toEqual(['A', 'B', 'C'])
  })

  test('keeps Vietnamese names and writes each share', () => {
    const csv = expensesCsv([expense()], members)

    expect(csv.split('\r\n')[1]).toBe(
      '2026-10-21,Lẩu,240000,Nguyễn Duy Anh,chia đều,120000,120000',
    )
  })

  test('a custom split says so and leaves a non-participant empty', () => {
    const csv = expensesCsv(
      [expense({ split_type: 'custom', shares: [{ member_id: 2, amount: 240_000 }] })],
      members,
    )

    expect(csv.split('\r\n')[1]).toBe(
      '2026-10-21,Lẩu,240000,Nguyễn Duy Anh,chia riêng,,240000',
    )
  })

  test('names a payer who is no longer in the household', () => {
    const csv = expensesCsv([expense({ payer_id: 99 })], members)

    expect(csv.split('\r\n')[1]).toBe(
      '2026-10-21,Lẩu,240000,Thành viên đã xoá,chia đều,120000,120000',
    )
  })

  test('keeps the amount of a share whose member is gone', () => {
    const csv = expensesCsv(
      [
        expense({
          shares: [
            { member_id: 1, amount: 100_000 },
            { member_id: 2, amount: 100_000 },
            { member_id: 99, amount: 40_000 },
          ],
        }),
      ],
      members,
    )
    const [head, row] = csv.split('\r\n')

    expect(head).toBe(`${header},Thành viên đã xoá`)
    expect(row).toBe('2026-10-21,Lẩu,240000,Nguyễn Duy Anh,chia đều,100000,100000,40000')
  })

  test('the member columns of every row add up to the amount', () => {
    const csv = expensesCsv(
      [
        expense(),
        expense({
          id: 2,
          amount: 450_000,
          spent_at: '2026-10-20',
          shares: [
            { member_id: 1, amount: 150_000 },
            { member_id: 2, amount: 300_000 },
          ],
        }),
      ],
      members,
    )
    const [head, ...rows] = csv.split('\r\n')
    const columns = head.split(',')
    const amountAt = columns.indexOf('Số tiền (đồng)')
    const firstMember = columns.indexOf('Nguyễn Duy Anh')

    for (const row of rows) {
      const cells = row.split(',')
      const parts = cells
        .slice(firstMember)
        .reduce((sum, cell) => sum + Number(cell || 0), 0)
      expect(parts).toBe(Number(cells[amountAt]))
    }
  })
})

describe('fileSlug', () => {
  test.each([
    ['Nhà trọ Q7', 'nha-tro-q7'],
    ['Đại học', 'dai-hoc'],
    ['Fair Share', 'fair-share'],
    ['  ***  ', 'nha'],
    ['', 'nha'],
  ])('fileSlug(%s) is %s', (name, slug) => {
    expect(fileSlug(name)).toBe(slug)
  })
})
