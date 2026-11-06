# Research: Recurring expenses

## R1. Where "one record per item and month" lives

- **Decision**: a nullable `expenses.recurring_item_id` (FK to `recurring_items`, `ON DELETE SET NULL`)
  and

  ```sql
  CREATE UNIQUE INDEX expenses_recurring_month_uidx
    ON expenses (recurring_item_id, (date_trunc('month', spent_at::timestamp without time zone)::date))
    WHERE recurring_item_id IS NOT NULL;
  ```

  `spent_at` is `date NOT NULL`; the cast to `timestamp without time zone` and `date_trunc` on it are
  immutable, so the expression can be indexed and does not depend on the session time zone.
- **Rationale**: FR-009 must hold for inserts and for edits of the date, under concurrency; only the
  database sees every write. The month is the expense's date, not the saving time (US2-3). The record is
  the expense itself, so there is no second table to keep in step when a date or a deletion changes.
- **Alternatives considered**: a `recurring_periods` table (must be kept in step on every edit and
  delete); a check in Python before insert (races between two requests).

## R2. Creating the item with its first expense

- **Decision**: `ExpenseIn.recurring: {varying_amount: bool} | None`. On `POST` with it: the split must be
  equal (`422 recurring_needs_equal_split`); lock the house row (`SELECT … FROM households … FOR UPDATE`),
  count active items, refuse the 21st (`409 too_many_recurring`), insert the item from the body (day =
  `spent_at.day`, amount = None if varying), then insert the expense with `recurring_item_id` = the new
  id. One request is one transaction (`app/db.py`), so both or neither are kept. Ignored on `PUT`.
- **Rationale**: FR-002–FR-004; the house lock serialises two creations of the 20th item.
- **Alternatives considered**: a separate `POST /recurring` (two requests, not atomic with the expense).
  An idempotency key per save is left out (spec Assumptions): the form disables Lưu while saving.

## R3. Recording from an item

- **Decision**: `ExpenseIn.recurring_item_id: int | None` on `POST`: `SELECT … FROM recurring_items WHERE
  id = %s AND household_id = %s FOR SHARE`; missing → `404 recurring_not_found`; stopped →
  `409 recurring_stopped`. Then the normal expense insert with the link. `errors.UniqueViolation` on
  `expenses_recurring_month_uidx` → `409 recurring_month_taken`, with `details: {expense_id}` of the
  existing record so the page can offer it. The whole request rolls back.
- **Rationale**: FR-007–FR-009, FR-013. `FOR SHARE` against stop's `FOR UPDATE` means a save either lands
  before the stop or sees it stopped (spec edge case).

## R4. Edits

- **Decision**: `PUT` never changes `recurring_item_id` (a sent value is ignored); it keeps the stored one.
  A new `spent_at` in a month already recorded for the same item hits the index → `409
  recurring_month_taken`, rolled back. Deleting is unchanged (the row goes, the month is free).
- **Rationale**: FR-010–FR-011, US3; same pattern as `category` after #199 (an older page must not drop
  the link). Moving an expense between items is not a use case.

## R5. Stopping and listing

- **Decision**: `GET /api/households/{id}/recurring` → active items, oldest first. `POST
  /api/recurring/{id}/stop` → `require_owner_or_author(access, created_by)`, `UPDATE … SET active = false,
  stopped_at = now()` with `FOR UPDATE`; stopping a stopped item is a no-op 204. Access for
  `/recurring/{id}` resolves the household through `recurring_items` like `/expenses/{id}`.
- **Rationale**: FR-012–FR-014; a stopped item is never deleted, so links stay.

## R6. The item's people

- **Decision**: `recurring_items.member_ids bigint[]` (1–50) and `payer_id`, neither a foreign key. Filling the form keeps only ids that are members with an account now (`role !== null` in
  the members list), says who was left out, and leaves the payer empty if they left (FR-008). The server
  still applies its existing rule on save (new expenses only between people with an account).
- **Rationale**: an equal split needs only who; a FK on each array element is not possible and not
  needed, since the expense save validates them.
- House deletion: items go with the house (`ON DELETE CASCADE`); with no FK to members there is no
  ordering problem like the one noted in 001, so `delete_household` is unchanged.

## R7. What is due (SPA)

- **Decision**: `lib/recurring.ts`: `dueDay(day, month)` = min(day, days in month); `monthState(item,
  expenses, today)` = `recorded` if an expense has `recurring_item_id === item.id` and its month is this
  month, else `due` if today's day ≥ dueDay, else `later`. `dueItems` = active items in `due`, ordered by
  day then id. Today = `lib/date.ts today()`.
- **Rationale**: FR-005, FR-006; no new request beyond the items list; the expenses are already loaded.

## R8. The form

- **Decision**: new `ExpenseForm` props `fromItem?: RecurringItem`; the tick and "Số tiền thay đổi" are
  local state, offered only when adding and not from an item; the period line "Đang ghi kỳ M/YYYY"
  follows the date; `toInput()` adds `recurring` or `recurring_item_id`. Prefill builds the initial state
  directly (equal split, the kept members, category, amount or empty with focus) instead of `fill()`,
  which marks AI and forces its own rules. Leaving out a member shows a note above the split.
- **Rationale**: FR-001, FR-003, FR-007, FR-008.

## R9. Placement

- **Decision**: `DueCard` right after `VerdictBlock` in `.split-lead` (left column on a computer, after
  the transfers panel; on a phone after the transfers, before the right column). 3 lines, then "Xem tất
  cả (n)". Neutral surface.
- **Rationale**: FR-006, SC-006: the right column is unchanged, so spec 006's first-screen check holds.
