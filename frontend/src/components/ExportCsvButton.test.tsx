import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Expense, Member } from '../api/types'
import { today } from '../lib/date'
import ExportCsvButton from './ExportCsvButton'

const members: Member[] = [
  { id: 1, household_id: 7, name: 'Nguyễn Duy Anh', created_at: '' },
  { id: 2, household_id: 7, name: 'Trần Thị Bích', created_at: '' },
]

const expenses: Expense[] = [
  {
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
  },
]

const createObjectURL = vi.fn<(blob: Blob) => string>()
const revokeObjectURL = vi.fn<(url: string) => void>()
let downloaded: string | null

beforeEach(() => {
  createObjectURL.mockReset().mockReturnValue('blob:fair-share')
  revokeObjectURL.mockReset()
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
  downloaded = null
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloaded = this.download
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (URL as unknown as Record<string, unknown>).createObjectURL
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL
})

describe('ExportCsvButton', () => {
  test('is disabled, and says why, when there are no expenses', () => {
    render(<ExportCsvButton expenses={[]} members={members} householdName="Nhà trọ Q7" />)

    const button = screen.getByRole('button', { name: 'Xuất CSV' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Chưa có khoản chi để xuất')
  })

  test('downloads a named CSV with a BOM and the header row', async () => {
    render(<ExportCsvButton expenses={expenses} members={members} householdName="Nhà trọ Q7" />)

    const button = screen.getByRole('button', { name: 'Xuất CSV' })
    expect(button).toBeEnabled()
    await userEvent.click(button)

    expect(downloaded).toBe(`fair-share-nha-tro-q7-${today()}.csv`)
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toBe('text/csv;charset=utf-8')
    // Decoding strips a BOM, so read the bytes to see it
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder().decode(bytes.slice(3))
    expect(text.split('\r\n')[0]).toBe(
      'Ngày,Nội dung,Số tiền (đồng),Người trả,Cách chia,Nguyễn Duy Anh,Trần Thị Bích',
    )
    expect(text).toContain('2026-10-21,Lẩu,240000,Nguyễn Duy Anh,chia đều,120000,120000')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fair-share')
    expect(document.querySelector('a')).toBeNull()
  })
})
