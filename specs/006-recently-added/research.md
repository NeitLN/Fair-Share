# Research: "Mới ghi"

## R1. Who recorded it

- **Decision**: `created_by` (an account id) compared with `session.user.id`. Its name comes from the
  member whose `user_id` is that id; if no member has it any more, the removed-member name
  (`REMOVED_MEMBER`). `created_by` null or missing (records from before accounts) leaves the record out.
- **Rationale**: FR-002. Payer and participants are a different question: Minh recording an expense
  Tiến paid is still news for Tiến. The members list carries `user_id` for the accounts in the house.
- **Alternatives considered**: matching on `payer_id` (wrong for "ghi hộ"); hiding records whose
  recorder left (they still changed the balances).

## R2. Comparing saved times

- **Decision**: `savedKey(ts)` turns the server's `created_at` into `YYYY-MM-DDTHH:MM:SS.ffffff` (UTC,
  fraction padded to 6 digits) and items and marks compare as strings. The 7-day first-visit window is
  the only place a `Date` is used (device clock, FR-006).
- **Rationale**: the API writes `2026-11-05T19:33:16.279230Z`, but a value with no fraction comes out as
  `…:16Z`, and `.` sorts before `Z`, so raw strings would order wrongly; `Date` keeps milliseconds only,
  which FR-010 forbids. A string key is exact and cheap.
- **Alternatives considered**: `Date.parse` (loses microseconds); BigInt of microseconds (more code for
  the same result).

## R3. The two marks

- **Decision**: `{expenses, settlements}`, each the greatest `savedKey` among that list **as used to build
  the strip** when "Đã xem tất cả" is pressed (all records in it, the member's own included, so the mark
  is never earlier than what was on screen). A mark is written only if it is later than the stored one.
  The page keeps the list it built the strip from and marks from that, not from a refetch that arrived
  since.
- **Rationale**: FR-009, Story 2 scenario 5: repayments refresh every 30 s and expenses do not, so one
  mark would swallow an expense not yet fetched. Taking own records into account is safe: they are never
  listed.
- **Alternatives considered**: one mark (the bug above); a set of seen ids (kept for later, Assumptions).

## R4. Storage

- **Decision**: `localStorage` key `fair-share:seen:<userId>:<householdId>`, JSON
  `{"expenses": key | null, "settlements": key | null}`. Read and write inside `try`; a parse error or a
  blocked storage reads as "no marks". After "Đã xem tất cả" the page also keeps the marks in state, so the
  strip stays hidden for this visit even if storage failed. No mark at all → first-visit window.
- **Rationale**: FR-011; same prefix and style as `lib/identity.ts` and `lib/session.ts`; per user and per
  house so signing in as someone else or opening another house never carries a mark over.

## R5. Where and how it shows

- **Decision**: first child of `.split-rest` on Tổng quan. On a computer that is the top of the right
  column, above "Tháng …"; on a phone `.split-lead` (add button, verdict, transfers panel) comes first, so
  the strip follows the money actions. A `<section aria-labelledby>` with an `<h2>` "Mới ghi", a list of
  links, "Xem thêm N" (button, `aria-expanded`) and "Đã xem tất cả" (button, accessible name with N).
  The section is a polite live region (`aria-live="polite"`), so it is announced without taking focus.
  Default count: 3 from 1024 px (`useWide()`), 5 below. Neutral surface: `--surface`, `--card-edge`.
- **Rationale**: FR-005, FR-013, FR-014, SC-004; the existing split already gives the phone order the
  critique asked for without a second placement.

## R6. Opening a record

- **Decision**: an expense item is a `Link` to `/households/:id/expenses` with state
  `{ revealExpense: id }` (the existing hand-off); a repayment item is a link to `#settlement-<id>` on the
  same page (the anchor `SettlementList` renders). A deleted record: Chi tiêu ignores an unknown id, the
  anchor does not exist; nothing else happens (FR-008).

## R7. Text

- **Decision**: "<Name> ghi <description> · <amount>" and "<Name> ghi đã nhận <amount> từ <payer|bạn>",
  plus the time with `dayLabel` and `HH:MM` ("Hôm nay, 06/11 · 14:05"). English: "<Name> added …",
  "<Name> recorded receiving <amount> from <payer|you>".

## R8. Tests

- **Decision**: unit tests of `savedKey` (with and without fraction, padding, ordering across the `Z`
  case), `recentItems` (own records out, null recorder out, removed recorder named, ghi hộ in, received
  from you in, ordering across lists, first-visit 7 days, marks per list, strictly later), marks
  storage (round trip, never moves back, blocked storage). Component and page tests for fold, mark,
  remount, partial data and placement. E2E on a local stack with two accounts.
