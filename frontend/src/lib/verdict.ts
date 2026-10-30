import type { Expense, MemberBalance, Transfer } from '../api/types'
import { messages } from '../i18n'
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

// "Minh", "Minh và Lan", "3 người" ("Minh", "Minh and Lan", "3 people")
function people(names: string[]): string {
  const t = messages().verdict
  if (names.length <= 2) return names.join(t.and)
  return t.nPeople(names.length)
}

const sum = (transfers: Transfer[]) => transfers.reduce((total, t) => total + t.amount, 0)

/**
 * The verdict block's sentence (DESIGN.md §6.2), from the suggested transfers that involve you. The
 * names, the number of people and the total all come from the same rows, which the block lists below.
 * `started` is false for a household where nobody has spent anything yet.
 */
export function verdict(suggested: Transfer[], me: number | null, nameOf: NameOf, started: boolean): Verdict {
  const t = messages().verdict
  const count = suggested.length
  if (count === 0) return { sentence: started ? t.allSquare : t.nothingYet, total: null }
  if (me === null) return { sentence: t.paymentsLeft(count), total: null }

  const iPay = suggested.filter((t) => t.from_member_id === me)
  if (iPay.length > 0) {
    return { sentence: t.youPay(people(iPay.map((p) => nameOf(p.to_member_id)))), total: sum(iPay) }
  }
  const iGet = suggested.filter((t) => t.to_member_id === me)
  if (iGet.length > 0) {
    const names = iGet.map((p) => nameOf(p.from_member_id))
    return { sentence: t.youGet(people(names), names.length > 1), total: sum(iGet) }
  }
  return { sentence: t.youAreSquare(count), total: null }
}

/** One transfer from where you stand: "Bạn trả Minh", "Minh trả bạn" ("You owe Minh", "Minh owes you"). */
export function transferText(transfer: Transfer, me: number | null, nameOf: NameOf): string {
  const t = messages().verdict
  const fromIsYou = transfer.from_member_id === me
  const from = fromIsYou ? t.you : nameOf(transfer.from_member_id)
  const to = transfer.to_member_id === me ? t.youObject : nameOf(transfer.to_member_id)
  return t.pays(from, to, fromIsYou)
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
  const t = messages().verdict
  const lines = suggested.map((p) =>
    t.reminderLine(nameOf(p.from_member_id), nameOf(p.to_member_id), formatVND(p.amount)),
  )
  return [t.reminderHead(householdName, month), ...lines, t.reminderLink(link)].join('\n')
}

/** What the household spent in the month of `isoDate` ("YYYY-MM-…"), from its expenses. */
export function spentInMonth(expenses: Expense[], isoDate: string): number {
  const month = isoDate.slice(0, 7)
  return expenses.filter((e) => e.spent_at.slice(0, 7) === month).reduce((total, e) => total + e.amount, 0)
}
