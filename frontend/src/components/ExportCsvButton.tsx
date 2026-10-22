import type { Expense, Member } from '../api/types'
import { expensesCsv, fileSlug } from '../lib/csv'
import { today } from '../lib/date'

interface ExportCsvButtonProps {
  expenses: Expense[]
  members: Member[]
  /** Used in the file name: `fair-share-<slug>-<date>.csv`. */
  householdName: string
}

/** "Xuất CSV" downloads the whole list as a file Excel opens with the right encoding. */
function ExportCsvButton({ expenses, members, householdName }: ExportCsvButtonProps) {
  const empty = expenses.length === 0

  function download() {
    // The BOM lets Excel read the Vietnamese characters as UTF-8
    const blob = new Blob(['\uFEFF' + expensesCsv(expenses, members)], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `fair-share-${fileSlug(householdName)}-${today()}.csv`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      className="secondary"
      disabled={empty}
      title={empty ? 'Chưa có khoản chi để xuất' : undefined}
      onClick={download}
    >
      Xuất CSV
    </button>
  )
}

export default ExportCsvButton
