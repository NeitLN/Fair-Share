# Research: Telling the amount actually sent

## R1. What "version" is

- **Fact**: `payment_notices` has one row per pair, replaced on telling again (`ON CONFLICT DO UPDATE`), deleted on
  "Đã nhận" and on taking back. Answers name only the amount; taking back is not checked.
- **Decision**: a `version bigint` column filled from one sequence `notice_versions`, set to `nextval` on every
  insert and every update. A deleted and re-created notice therefore never repeats a version a stale screen holds.
  Every action body carries `version` (the one shown) or `null` (the screen showed no notice for that pair).
- **Alternatives**: a per-row counter starting at 1 (repeats after delete and re-create, which defeats the check);
  `updated_at` timestamps (two changes in the same microsecond, and clock types leak into the API).

## R2. One step with the balances (FR-002)

- **Fact**: telling computes the transfers then writes; expenses and repayments are written without any house lock;
  `lock_household()` (`SELECT … FOR UPDATE` on the household row) exists for membership changes.
- **Decision**: telling and "Báo thêm" take `FOR UPDATE` on the household row before computing the transfers; every
  other money write (expense create, update, delete; repayment create, delete; notice accept) takes `FOR SHARE` on the
  same row first. Money writes still run side by side; a telling waits for them and they wait for it.
- **Alternatives**: `SERIALIZABLE` transactions (retries everywhere, harder to test); an advisory lock (same effect,
  less visible than the row lock already used).

## R3. Partial confirmation and hand-typed repayments (FR-007, FR-008)

- **Decision**: `POST …/notices/{from}/accept` takes `{version, received, settled_at}`; `received` defaults to the
  notice's amount and may be 1..amount. The repayment is inserted with `notice_amount = received`; the notice is
  reduced by `received` (deleted at zero, version bumped otherwise), in one transaction under `FOR UPDATE` on the
  notice row. `POST …/settlements` gains an optional `notice: {version}`; with it, the repayment is "told money":
  `notice_amount = min(amount, notice.amount)` and the notice is reduced the same way; a version mismatch inserts
  nothing (409). Without it nothing about notices changes; today's "delete the notice when the amount is equal"
  rule goes away (it is what let money be counted twice).
- **Alternatives**: keep the equality rule (fails as soon as amounts can differ); attribute every repayment
  automatically (misreads unrelated or backdated payments).

## R4. Giving back on delete (FR-011a)

- **Decision**: `DELETE /settlements/{id}` reads `notice_amount`; when it is set and the pair has no notice, it
  inserts a waiting notice of that amount (no note, new version). When a notice exists it does nothing to it; the
  page has already warned. Undo in the toast uses the same delete.
- **Alternatives**: add back into an existing notice (can pass 10^12 and mixes a declined part with a waiting one).

## R5. Ceiling and amount for telling and adding (FR-001, FR-002, FR-005)

- **Decision**: `PUT …/notices` takes `{to_member_id, amount, note, version}`: allowed when the pair is suggested now
  and `amount ≤ suggested`; `version` must match the current notice (or be null when none). It replaces a declined
  notice. `POST …/notices/{to}/add` takes `{amount, note, version}` on a waiting notice; the new total must be ≤ the
  suggestion and ≤ 10^12. Order of checks: version (409 `notice_changed`), then pair and ceiling (409
  `suggestion_changed`); Pydantic gives 422 for non-integers, booleans, ≤ 0 or > 10^12.
- **Alternatives**: one endpoint with a mode flag (less clear errors, harder to test).

## R6. Note

- **Decision**: `note` on the notice, `text(120)`, trimmed, line breaks folded to spaces, blank stored as null (the
  same cleaning as other names and notes in `schemas.py`). Telling replaces it; adding replaces it only when given;
  the repayment created from a notice copies it into its own `note` (≤ 200) when it has none.

## R7. The page while confirming (FR-011)

- **Fact**: `usePaidTransfers` drops the pair from `owed` as soon as the repayment is created, so a part confirmed
  can show "sạch nợ" before the balances arrive.
- **Decision**: keep a per-pair `recording` state; `owed` keeps the pair until the refetched balances arrive; a 409
  reloads notices and balances; a network error with unknown outcome reloads both before the buttons come back.

## R8. Where the words and steps live

- **Decision**: one component `NoticeAmountStep` (amount with the expense form's `parseAmount` and "= …đ" echo,
  optional note, Enter, Escape back to the opener, errors under the field) used for "Chuyển số khác", "Báo thêm"
  and "Nhận số khác". `VerdictBlock` renders the lines; `SettlementForm` the told-money choice. Words in the `verdict`
  and `settle` groups of `i18n`.
