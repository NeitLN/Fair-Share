# Research: No double save

## R1. Serializing one identity (FR-003, FR-004)

**Decision:**

1. Take the existing house lock (shared for a plain expense or repayment; exclusive when a recurring item is made, see R5).
2. Take `SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))` on the string `"draft:{household}:{user}:{uuid}"`.
3. Run `find_draft()`.

The lock is released at commit or rollback.

**Rationale:**

- A second request with the same identity waits until the first commits, then finds its row.
- No new lock order is added: the house lock is still first.
- Two different identities never block each other.

**Alternatives considered:**

- **The unique index alone.** A loser can hit `month_taken` or the notice row first (review round 1, point 5).
- **`SELECT … FOR UPDATE` on a placeholder row.** It needs an extra table.

## R2. Fingerprint (FR-006)

**Decision:**

- `fingerprint(kind, body)` returns the SHA-256 hex digest of the canonical JSON (`sort_keys`, no spaces) of the normalized fields.
- **Expense (S1):**
  - `description.strip()`, `amount`, `payer_id`, `spent_at`, `category or "other"`;
  - the split, as `{"type": "equal", "members": sorted(ids)}` or `{"type": "custom", "shares": {id: amount}}` with sorted keys;
  - `recurring`, as `{"tick": varying}` or `{"item": recurring_item_id}` or `null`.
- **Repayment (S2):** `from`, `to`, `amount`, `settled_at`, `note.strip() or None`.
- **Repayment (S3):** the same without `settled_at`. The page sends a flag `draft_kind: "card"`, so the server knows to leave the date out.
- **Left out:** `source`, and `notice` with its version.

**Rationale:** it is stable across a retry (FR-006), small to store, and not shown to anyone.

## R3. Order inside the routes (FR-003, FR-005, FR-007)

**Decision:** `create_expense` and `create_settlement`, when `body.draft_id` is set, run these steps:

1. Lock the house (R5).
2. `lock_draft`.
3. `find_draft(conn, table, household, user, draft_id)`:
   - **Found, same fingerprint:** return the record with status 200 (set through `Response.status_code`).
   - **Found, different fingerprint:** raise `409 draft_already_saved`, with details `{kind, id}`.
4. Otherwise, the normal path. The insert writes `draft_id` and `draft_fingerprint`.
5. On a `UniqueViolation`, look `find_draft` up again first (FR-007), then fall back to the existing `month_taken`.

## R4. S3 identity on the card (FR-001)

**Decision:**

- `usePaidTransfers` keeps `cardDrafts: Map<pairKey, { id: string, amount: number, unknown: boolean }>`.
- `pay()` reuses the entry for the pair when its amount equals the transfer's amount, or when `unknown` is true. Otherwise it makes a new UUID.
- On success the entry is deleted.
- On `outcome_unknown`, the entry gets `unknown = true`. It is cleared when a settlements read shows a repayment with that `draft_id`. Settlements return `draft_id` for that purpose: it is shown to the owner's account only, and is harmless.
- On an answered refusal, the entry is deleted unless the refusal was `draft_already_saved`. That answer stamps the card (FR-009).

## R5. The recurring-tick deadlock (spec Assumptions, SC-002)

**Finding:**

- `create_expense` takes `FOR SHARE` on the house, then `new_recurring_item` updates a row of the same house.
- Two concurrent ticked saves can each hold `FOR SHARE` and then wait on each other's row lock, which is a deadlock (40P01).

**Decision:** when `body.recurring` is set, take the exclusive house lock (`lock_household(conn, id)`). Recurring-item creation is rare, so the cost is negligible.

## R6. Page lines and answers (FR-008 to FR-010)

**Decision:**

- **A 200 from a create route:** handled by the same `onSuccess` as a 201 (the client does not branch on the status).
- **`draft_already_saved`:** maps through `saveOutcome` to the new lines, plus the actions "Xem" and "Ghi thành khoản mới". "Ghi thành khoản mới" calls the form's `newDraft()`, then submits.
- **`save.A1.unknown`, `save.A2.unknown`, `save.A5.unknown`:** replaced with the spec US4 wording in vi and en.

## R7. "Tạo nhà" (FR-011)

**Decision:** a `useRef(false)` in-flight guard in `HouseholdCreateForm.handleSubmit`, the same pattern as `ExpenseForm`'s `saving.current`.
