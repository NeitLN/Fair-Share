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

export type Role = 'owner' | 'member'

/** A household as the signed-in user sees it: their role and their name in the split. */
export interface MyHousehold extends Household {
  role: Role
  member_id: number
  /** What the house owes them (or they owe it) in đồng, from the same answer as the list. */
  my_net?: number
  /** Join requests to approve (owner only) and "Tôi đã chuyển" notices to answer. */
  waiting?: number
}

/** A request to join that is still waiting: nothing about the household until it is approved. */
export interface PendingRequest {
  household_id: number
  requested_at: string
}

export interface MyHouseholds {
  households: MyHousehold[]
  pending: PendingRequest[]
}

/** A name in a household's split. Names are unique inside one household (US-02). */
export interface Member {
  id: number
  household_id: number
  name: string
  /** ISO 8601 timestamp from `timestamptz`. */
  created_at: string
  /** The role of the account using this name; null for a name from before accounts nobody took. */
  role?: Role | null
  user_id?: number | null
  /** That account's status while it is an owner or member here (specs/010-profile-page). */
  status?: string | null
  /** The version of that account's photo, under the same rule; the photo comes from the photos batch. */
  photo_version?: string | null
  /** That account's gender if they stated one, under the same rule. */
  gender?: Gender | null
}

/** GET /api/me/photo: the caller's own photo as a data URL, or nulls. */
export interface MyPhoto {
  version: string | null
  data: string | null
}

/** GET /api/households/{id}/photos: every current owner's and member's photo. */
export interface HouseholdPhotos {
  photos: { member_id: number; version: string; data: string }[]
}

// --- Accounts (docs/ACCOUNTS.md) -----------------------------------------------------------------

export interface User {
  id: number
  email: string
  display_name: string
  /** A short status housemates see; null for none (specs/010-profile-page). */
  status?: string | null
  /** An optional gender; null is "Không nêu", the default. */
  gender?: Gender | null
}

export type Gender = 'male' | 'female' | 'other'

/** A household where the new name was someone else's, so the old one stayed (specs/010-profile-page). */
export interface KeptName {
  household_id: number
  household_name: string
  name: string
}

/** PATCH /api/me: the account as it is now, and the households that kept the old name. */
export interface RenameResult {
  user: User
  kept: KeptName[]
}

/** What signing up or in answers: the token goes in `Authorization: Bearer …`. */
export interface Session {
  token: string
  user: User
}

export interface InviteCode {
  /** 8 characters; null when there is none and only the owner can make one. */
  code: string | null
  expires_at: string | null
}

export interface JoinResult {
  status: 'pending' | 'member'
  household_id: number | null
}

/** Someone asking to join, as the owner sees them. */
export interface JoinRequest {
  user_id: number
  display_name: string
  email: string
  requested_at: string
}

/** A household from before accounts whose old invite link was opened, to take it over. */
export interface ClaimInfo {
  id: number
  name: string
  members: Member[]
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
/** What an expense was for (specs/005-expense-categories); lib/categories.ts has the names. */
export type Category = 'food' | 'groceries' | 'utilities' | 'rent' | 'transport' | 'household' | 'other'

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
  /** "other" for an expense from before categories. */
  category: Category
  /** ISO 8601 timestamp from `timestamptz`. */
  created_at: string
  /** "equal" when the shares happen to be the equal split, so the edit form can preselect it. */
  split_type: SplitType
  /** One per participant, in member id order. */
  shares: Share[]
  /** The account that recorded it; null for one from before accounts (the owner's to change). */
  created_by?: number | null
  /** The recurring item this is the month's expense of (specs/007-recurring-expenses). */
  recurring_item_id?: number | null
}

/** A recurring item (specs/007-recurring-expenses): how to fill the form again when its day comes. */
export interface RecurringItem {
  id: number
  household_id: number
  description: string
  category: Category
  payer_id: number
  /** Shared equally between them. */
  member_ids: number[]
  /** null: the amount changes every month and is typed each time. */
  amount: number | null
  /** Day of the month, 1–31 (the month's last day when shorter). */
  day: number
  created_by: number | null
  created_at: string
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
  /** Defaults to "other" on the server. */
  category?: Category
  /** New expenses only: make it recur every month (specs/007-recurring-expenses). */
  recurring?: { varying_amount: boolean }
  /** New expenses only: this is the month's expense of that recurring item. */
  recurring_item_id?: number
  split:
    | { type: 'equal'; member_ids: number[] }
    | { type: 'custom'; shares: Share[] }
}

/** "from_member_id" paid "amount" đồng to "to_member_id". */
/** "Tôi đã chuyển": the person who owes told the receiver (docs/ACCOUNTS.md, S3). No balance changes. */
export interface Notice {
  from_member_id: number
  to_member_id: number
  /** The suggested amount when it was sent; "Đã nhận" records this. */
  amount: number
  /** declined: the receiver answered "Chưa nhận được". */
  status: 'sent' | 'declined'
  created_at: string
}

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
  /** The account that recorded it (the person who received it); null before accounts. */
  created_by?: number | null
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
  /** Added by getBalances, not the API: which balances request this answers (api/settlements.ts). */
  fetchCount?: number
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
  split: DraftSplit
}

export interface DraftShare {
  member_id: number
  amount: number
}

/**
 * How the draft splits the amount (specs/009-ai-custom-split): equally as before; by the amounts the
 * sentence named, adding up to the draft's amount; or blocked, with the amounts as read for display
 * only and the code of the warning that says why.
 */
export type DraftSplit =
  | { type: 'equal'; member_ids: number[] }
  | {
      type: 'custom'
      shares: DraftShare[]
      /** Who took what was left after the named amounts; null when nothing was left or it was split equally. */
      rest_to: number | null
      rest_amount: number
      /** The rest went to the payer, so the split only holds with that payer. */
      rest_to_payer: boolean
    }
  | { type: 'blocked'; reason: string; preview: DraftShare[] }

/** Something the user should check before saving the draft. */
export interface DraftWarning {
  code: string
  /** The server's English text, used only when the code has no Vietnamese wording. */
  message: string
  /** The name as written, for unknown_member and the other codes about one name. */
  name?: string | null
  /** over_total: the named amounts' sum and the total. */
  named_sum?: number | null
  total?: number | null
  /** no_rest_taker, nobody_for_equal_rest: what was left to place. */
  remainder?: number | null
}

export interface AiDraft {
  draft: ExpenseDraft
  /** Empty when the sentence was understood completely. */
  warnings: DraftWarning[]
}
