import type { Expense, MemberBalance, Transfer } from '../api/types'
import { formatVND } from './money'

/** The short name of a member id (lib/names.ts), or the removed-member label. */
export type NameOf = (memberId: number) => string

export interface Verdict {
  /** The block's headline, e.g. "Bạn cần trả Minh". */
  sentence: string
  /** The big number under it: what you pay or get in total; null when the sentence says it all. */
  total: number | null
}

/** Someone took part in the household's money: they paid, owe, sent or received something. */
export function tookPart(balance: MemberBalance): boolean {
  return balance.paid > 0 || balance.owed > 0 || balance.sent > 0 || balance.received > 0
}

// "Minh", "Minh và Lan", "3 người"
function people(names: string[]): string {
  if (names.length <= 2) return names.join(' và ')
  return `${names.length} người`
}

const sum = (transfers: Transfer[]) => transfers.reduce((total, t) => total + t.amount, 0)

/**
 * The verdict block's sentence (DESIGN.md §6.2), from the suggested transfers that involve you. The
 * names, the number of people and the total all come from the same rows, which the block lists below.
 * `started` is false for a household where nobody has spent anything yet.
 */
export function verdict(suggested: Transfer[], me: number | null, nameOf: NameOf, started: boolean): Verdict {
  const count = suggested.length
  if (count === 0) {
    return {
      sentence: started ? 'Cả nhà sạch nợ. Nhà trọ bình yên.' : 'Chưa có khoản chi nào. Ghi khoản đầu tiên để xem ai trả ai.',
      total: null,
    }
  }
  if (me === null) return { sentence: `Còn ${count} lần trả là cả nhà về 0đ`, total: null }

  const iPay = suggested.filter((t) => t.from_member_id === me)
  if (iPay.length > 0) {
    return { sentence: `Bạn cần trả ${people(iPay.map((t) => nameOf(t.to_member_id)))}`, total: sum(iPay) }
  }
  const iGet = suggested.filter((t) => t.to_member_id === me)
  if (iGet.length > 0) {
    return { sentence: `Bạn được nhận từ ${people(iGet.map((t) => nameOf(t.from_member_id)))}`, total: sum(iGet) }
  }
  return { sentence: `Bạn không nợ ai. Còn ${count} lần trả trong nhà.`, total: null }
}

/** One transfer from where you stand: "Bạn trả Minh", "Minh trả bạn", "Anh trả Minh". */
export function transferText(transfer: Transfer, me: number | null, nameOf: NameOf): string {
  const from = transfer.from_member_id === me ? 'Bạn' : nameOf(transfer.from_member_id)
  const to = transfer.to_member_id === me ? 'bạn' : nameOf(transfer.to_member_id)
  return `${from} trả ${to}`
}

/**
 * The plain text for the household's Zalo group (DESIGN.md §6.2): names only, no "Bạn", since everyone
 * reads it. No bank account or payment link of any kind (PROJECT_SPEC §3.3).
 */
export function reminderMessage(
  householdName: string,
  month: number,
  suggested: Transfer[],
  nameOf: NameOf,
  link: string,
): string {
  const lines = suggested.map(
    (t) => `• ${nameOf(t.from_member_id)} trả ${nameOf(t.to_member_id)} ${formatVND(t.amount)}`,
  )
  return [`${householdName} chốt sổ tháng ${month} nè:`, ...lines, `Xem chi tiết: ${link}`].join('\n')
}

/** What the household spent in the month of `isoDate` ("YYYY-MM-…"), from its expenses. */
export function spentInMonth(expenses: Expense[], isoDate: string): number {
  const month = isoDate.slice(0, 7)
  return expenses.filter((e) => e.spent_at.slice(0, 7) === month).reduce((total, e) => total + e.amount, 0)
}
