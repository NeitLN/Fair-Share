// JSON shapes for households and members, mirroring the ERD in
// docs/ARCHITECTURE.md §4. Field names must match the backend exactly:
// if the households/members API (T-08) uses different names, update them here.

/** A household. `id` is a PostgreSQL bigint, serialised as a JSON number. */
export interface Household {
  id: number
  /** 1–60 characters (US-01). */
  name: string
  /** ISO 8601 timestamp from `timestamptz`. */
  created_at: string
}

/** A member of a household. Names are unique inside one household (US-02). */
export interface Member {
  id: number
  household_id: number
  name: string
  /** ISO 8601 timestamp from `timestamptz`. */
  created_at: string
}

// --- Expenses, settlements and balances (US-03 to US-08) ---------------------------------------
// Mirrors app/schemas.py. Every amount is an integer number of đồng, never a float.

/** One member's part of an expense, in đồng. */
export interface Share {
  member_id: number
  amount: number
}

export type SplitType = 'equal' | 'custom'
export type ExpenseSource = 'manual' | 'ai'

/** An expense as the API returns it. `shares` always add up to `amount`. */
export interface Expense {
  id: number
  household_id: number
  description: string
  amount: number
  payer_id: number
  /** Plain date, "YYYY-MM-DD". */
  spent_at: string
  source: ExpenseSource
  /** ISO 8601 timestamp from `timestamptz`. */
  created_at: string
  /** "equal" when the shares happen to be the equal split, so the edit form can preselect it. */
  split_type: SplitType
  /** One per participant, in member id order. */
  shares: Share[]
}

/** Body of POST /api/households/{id}/expenses and PUT /api/expenses/{id}. */
export interface ExpenseInput {
  description: string
  amount: number
  payer_id: number
  /** Plain date, "YYYY-MM-DD". */
  spent_at: string
  /** Defaults to "manual" on the server. */
  source?: ExpenseSource
  split:
    | { type: 'equal'; member_ids: number[] }
    | { type: 'custom'; shares: Share[] }
}

/** "from_member_id" paid "amount" đồng to "to_member_id". */
export interface Settlement {
  id: number
  household_id: number
  from_member_id: number
  to_member_id: number
  amount: number
  /** Plain date, "YYYY-MM-DD". */
  settled_at: string
  note: string | null
  /** ISO 8601 timestamp from `timestamptz`. */
  created_at: string
}

/** Body of POST /api/households/{id}/settlements. */
export interface SettlementInput {
  from_member_id: number
  to_member_id: number
  amount: number
  /** Plain date, "YYYY-MM-DD". */
  settled_at: string
  note?: string
}

/** One member's totals in đồng, plus their net position. */
export interface MemberBalance {
  member_id: number
  name: string
  /** Expenses this member paid for. */
  paid: number
  /** This member's shares of all expenses. */
  owed: number
  /** Settlements this member paid to others. */
  sent: number
  /** Settlements others paid to this member. */
  received: number
  /** paid − owed + sent − received. Positive: the household owes them. Sums to 0 across members. */
  net: number
}

/** A payment that moves one member's balance towards zero. */
export interface Transfer {
  from_member_id: number
  to_member_id: number
  amount: number
}

export interface Balances {
  /** Every member, in member id order. */
  balances: MemberBalance[]
  /** Paying these settles everyone. */
  suggested: Transfer[]
}

// --- AI quick add (US-09, US-10) ---------------------------------------------------------------
// Mirrors app/schemas.py. A draft is never saved: the user checks it and sends the normal
// expense form.

/** A pre-filled expense form. Nulls mean the sentence did not give that field. */
export interface ExpenseDraft {
  description: string
  amount: number | null
  payer_id: number | null
  /** Plain date, "YYYY-MM-DD". */
  spent_at: string
  source: 'ai'
  split: { type: 'equal'; member_ids: number[] }
}

/** Something the user should check before saving the draft. */
export interface DraftWarning {
  code: string
  /** The server's English text, used only when the code has no Vietnamese wording. */
  message: string
  /** The name as written, for unknown_member. */
  name?: string | null
}

export interface AiDraft {
  draft: ExpenseDraft
  /** Empty when the sentence was understood completely. */
  warnings: DraftWarning[]
}
