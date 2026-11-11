# Research: Notices tell one story

## R1. The accept check (FR-006)

**Decision:**

- `accept_notice` calls `lock_household(conn, household_id)` (exclusive), then `compute(conn, household_id)`, then `suggested_amount(transfers, from_member, receiver)`.
- With `received` (default: the notice amount) and `ceiling` (0 when the result is None), the order of checks is:
  1. **Version:** `expect_version` (409 `notice_changed`), as today.
  2. **Amount:** `received` above the notice amount gets today's refusal.
  3. **Within the ceiling:** if `received <= ceiling`, record as today.
  4. **No statement:** if `body.warned_suggestion is None`, answer 409 `warning_required` with `details = {"suggestion": ceiling}`.
  5. **Changed suggestion:** if `body.warned_suggestion != ceiling`, answer 409 `suggestion_changed`.
  6. **Otherwise:** record.

**Rationale:**

- It is the same lock and the same computation `send_notice` and `add_to_notice` use, so the cost is known.
- It removes the shared-lock race found in review round 2.

**Alternatives considered:**

- **Keep the shared lock and re-check after the insert:** two concurrent accepts could still both pass.
- **Warn on the client only:** a stale card would record silently.

## R2. The add-back (FR-007 to FR-009)

**Decision:** `delete_settlement` does the following, in order:

1. Take the exclusive house lock (`lock_household(conn, access.household_id)`).
2. `SELECT … FOR UPDATE` the settlement, then check owner or author, as today.
3. Delete the settlement.
4. If `notice_amount` is set and both members still exist, lock the pair's notice row (`SELECT … FOR UPDATE` by pair) and do one statement:

```sql
INSERT INTO payment_notices (household_id, from_member_id, to_member_id, amount, created_by)
VALUES (…, x, payer_user)
ON CONFLICT (household_id, from_member_id, to_member_id) DO UPDATE
  SET amount = payment_notices.amount + EXCLUDED.amount,
      status = 'sent',
      version = nextval('notice_versions')
RETURNING amount
```

5. Keep the note and created_by on update, since they are not touched.
6. If the result is above `MAX_AMOUNT` (10¹²), raise the existing `amount_too_large`. The whole transaction rolls back.

**Rationale:**

- The exclusive house lock already serializes deletion with accept, send and add, which take the house lock.
- Decline and take-back lock the notice row, which step 4 waits on.
- The lock order is house, then row, everywhere, so there is no cycle.

**Checked:**

- The settlement row is locked before the notice row, and nothing else locks a settlement and then a notice in the other order.
- Inserts start at `version` default nextval (spec 014 migration 010).
- On conflict the version moves forward too.

**Tests:** spec 014's existing test that expects an existing notice to stay unchanged on deletion is replaced by the FR-007 cases.

## R3. Classifying notices on the client (FR-001)

**Decision:** a new `lib/notices.ts` exports one function:

```ts
classify(notice, suggestions): { kind: 'matched' | 'over' | 'unmatched', suggestion: number, excess: number }
```

It reads only `balances.suggested` and the notice. `VerdictBlock` builds a notice card for every sent notice whose pair is `unmatched`, whatever cards exist. This replaces today's "told-* only when no card has that pair" rule (review round 1, item 5).

**Rationale:** it is pure and tested on its own. It also fixes the hidden-behind-paid-card case.

## R4. The receiver's warning step (FR-003 to FR-005)

**Decision:**

- **Small state machine:** the card keeps local state `{ warnedFor: { version, suggestion } | null }`.
- **First press:** "Vẫn ghi đã nhận" or "Xác nhận đã nhận" with an over part sets `warnedFor` and shows the warning with "Ghi" / "Thôi".
- **Withdrawing:** an effect clears `warnedFor` when the notice version or the pair's suggestion differs from it (FR-005).
- **"Ghi":** sends `acceptNotice(…, warned_suggestion: warnedFor.suggestion)`.
- **A `warning_required` answer** (from a press made before the client knew the pair was over) sets `warnedFor` from `details.suggestion` and shows the warning. It is not shown as an error.
- **"Nhận số khác":** the step calls the same check before sending. An amount at or under the suggestion sends without a warning.

## R5. One guard per pair (FR-019)

**Decision:**

- A `useRef<Set<string>>` of busy pair keys lives in `DashboardPage`. The key is "from-to".
- It is passed to `usePaidTransfers` (which today has its own `recording` set) and checked synchronously by every notice action before `mutate`.
- A pair leaves the set when its action ends. After a `outcome_unknown` (spec 018), it leaves only after the next successful read of notices (`dataUpdatedAt` newer than the press).

## R6. Race lines (FR-020)

**Decision:**

- **Snapshot at the press:** the pair's notice `{ version, status, amount }` and the ids of the house's repayments.
- **On `notice_changed` / `suggestion_changed`:** after the refetch of notices and settlements resolves, `raceLine(before, after, pair)` in `lib/notices.ts` picks:
  1. **Declined:** the notice is now declined. On an unmatched pair, use the FR-004a wording instead.
  2. **Confirmed:** the notice is gone, and a repayment from the debtor to the receiver with `notice_amount > 0` has an id not in the snapshot.
  3. **Taken back:** the notice is gone, and nothing else changed for the pair.
  4. **Generic:** anything else.
- A 10 s timer and the next action on the pair clear it. A failed refetch shows the retry line.

## R7. The debtor block (FR-013 to FR-018)

**Decision:**

- **The row's status (C07):** uses the existing short partial wording (`toldShort`).
- **The repeated row:** the list drops the debtor's own suggested row when `suggestions.filter(from === me).length === 1` and the block shows it.
- **"Vì sao ra số này?" (D06):** the block's second copy is removed, keeping the one under the amount.
- **Busy label:** a `tellingLabel` prop on `NoticeAmountStep` and on the debtor buttons, set to "Đang báo…".
- **The QR line:** `.debtor-action .debtor-qr-missing` (already fixed in #293) is checked to be regular weight and muted.
- **History "Xoá":** `SettlementList` receives the set of settlement ids with a live card undo from `usePaidTransfers`, and hides "Xoá" for those ids.

## R8. The fill button (FR-021)

**Decision:**

- `NoticeAmountStep` gets an optional `fill?: { amount, label }`.
- `DebtorAction` computes `max` as the spec says. When `amount > max` and `max > 0` and the cap is not the 10¹² one, the problem line becomes `t.notices.onlyNeed(name, max)` with a button that sets the text to `String(max)` and focuses the field.
