# Tasks: No double save

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

**Tests**: requested (SC-001 to SC-006). Each phase writes its tests first; they must fail before the code that makes them pass.

**Delivery**: one PR, `feat/020-no-double-save`, from main, with three commits:

1. migration + server (Phases 1–3);
2. web (Phases 4–6);
3. E2E + docs (Phase 7).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Agree the migration number with Minh (spec 013): 013 if this PR lands first, else the next free one. Write it into `data-model.md` and `plan.md`. Done as 013: no spec 013 migration was on GitHub on 12/11; Minh has not confirmed yet, so the PR says spec 013 takes the next free number.
- [X] T002 Create branch `feat/020-no-double-save` from `main`. Confirm that pytest (local fstest), ruff, Vitest and lint are green before any change.

## Phase 2: Foundational (server, blocks all stories)

- [X] T003 Create `db/migrations/013_draft_ids.sql` as in `data-model.md`: nullable `draft_id uuid` and `draft_fingerprint text` on `expenses` and `settlements`, plus the partial unique indexes `(household_id, created_by, draft_id) WHERE draft_id IS NOT NULL`.
- [X] T004 [P] Create `tests/test_drafts.py` with failing tests for `app/services/drafts.py`:
  - `fingerprint()` is equal for a pure retry. That covers member order, a trimmed description, a blank note vs `None`, and a different `source`.
  - It differs for any change of amount, payer, date, split, category or recurring.
  - For `draft_kind="card"`, `settled_at` is not part of it.
- [X] T005 Create `app/services/drafts.py` with `fingerprint(kind, body)`, `lock_draft(conn, household_id, user_id, draft_id)` (`pg_advisory_xact_lock(hashtextextended(...))`) and `find_draft(conn, table, household_id, user_id, draft_id)` (research R1, R2).
- [X] T006 In `app/schemas.py`, add `draft_id: UUID | None = None` to `ExpenseIn` and `SettlementIn`, and `draft_kind: Literal["form", "card"] = "form"` to `SettlementIn`. Add `draft_id` to the `Settlement` response model.

## Phase 3: Server stories (US1, US2, US3)

- [X] T007 [P] [US1] Write failing tests in `tests/test_drafts.py` for expenses:
  - **Repeats:** a repeat with the same body gets 200 and the same id, with 1 row and the balances moved once. A changed body gets 409 `draft_already_saved` with `{kind: "expense", id}` and nothing changes.
  - **Repeat of "Ghi kỳ này":** 200, not `recurring_month_taken`.
  - **Repeat of a recurring-tick save:** 200, and only 1 recurring item.
  - **A repeat after the owner edited the expense:** 200.
  - **A repeat after a member was removed:** 200.
  - **After deletion:** the identity is free again, and a repeat creates a new row (201).
  - **Another account with the same `draft_id`:** an independent record.
  - **Old requests:** no `draft_id` behaves as today.
  - **Bad identity:** a malformed `draft_id` gets 422.
- [X] T008 [P] [US2] Write failing tests for hand-recorded repayments:
  - A repeat gets 200, with 1 row.
  - A repeat of a repayment taken from told money gets 200, and the notice was reduced once, even though its version changed.
  - A changed body gets 409.
  - The told-money repayment is deleted (spec 019 adds the money back), then repeated: it records once more and takes the told money once (US2-3).
- [X] T009 [P] [US3] Write failing tests for `draft_kind="card"`: a repeat with another `settled_at` gets 200.
- [X] T010 [P] Write failing concurrency tests (two connections, the threading helpers from `test_notices.py`). Two simultaneous requests with the same `draft_id` give 1 row, with answers `{201, 200}`. Cover:
  - a plain expense;
  - "Ghi kỳ này" (never `month_taken`);
  - a recurring-tick save (no deadlock, 1 item);
  - a repayment from told money (never `notice_changed`).
- [X] T011 [US1] In `app/routers/expenses.py` `create_expense`, implement R3 and R5:
  1. Take the exclusive house lock when `body.recurring` is set, otherwise the shared one.
  2. If `draft_id` is set: `lock_draft`, then `find_draft`. On a match return 200 (through `Response`); on a mismatch raise 409.
  3. Insert with `draft_id` and `draft_fingerprint`.
  4. On a `UniqueViolation`, `find_draft` first, then `month_taken`.
- [X] T012 [US2] In `app/routers/settlements.py` `create_settlement`, do the same, before `expect_version` and `take_from_notice`. Return `draft_id` in `SETTLEMENT_COLUMNS`. Settlements have no other unique index, so the FR-007 fallback is in `create_expense` only.
- [X] T013 Add `already_saved(kind, id) -> ApiError` to `app/services/drafts.py` (409, code `draft_already_saved`, details `{kind, id}`), built the same way as `month_taken` in `app/routers/expenses.py`. Both routes raise it.

**Checkpoint (commit 1):** T004 and T007–T010 pass, the full pytest suite is green, and ruff is clean.

## Phase 4: Web US1 + US4 (expense form, lines)

- [X] T014 [P] [US1] Write Vitest cases in `ExpensesPage.test.tsx`:
  - The same `draft_id` is sent on a second press after a lost answer, and a new one after a success.
  - A 200 repeat shows "Đã lưu" and resets the form.
  - `draft_already_saved` keeps the values and shows the line with "Xem" and "Ghi thành khoản mới"; the latter sends a new `draft_id`.
  - A quick-add fill keeps the `draft_id`.
- [X] T015 [US1] Give `ExpenseForm.tsx` the draft identity (a ref filled at the first press by `lib/draftId.ts`, which falls back to `getRandomValues()` on plain HTTP). Renew it at the FR-001 points: after a successful save, and through `saveAsNew()` exposed on the ref; opening the form, an edit, "Ghi kỳ này" and "Huỷ" remount it (its key), which starts a fresh one. Send it in `toInput()`. In `api/expenses.ts`, pass `draft_id`.
- [X] T016 [US1] In `ExpensesPage.tsx`, handle `draft_already_saved` (`formError`): the line, "Xem" (`reveal(id)`, refetch if missing), and "Ghi thành khoản mới" (`form.saveAsNew()`).
- [X] T017 [P] [US4] In `i18n/vi.tsx` and `en.tsx`, set the new `save.A1.unknown`, `save.A2.unknown` and `save.A5.unknown` lines (spec US4) and add the `draftAlreadySaved` lines for the expense and the repayment. Update `saveOutcome.test.ts` and the `ExpensesPage` / `DashboardPage` tests that read the old unknown lines.

## Phase 5: Web US2 + US3 (repayments)

- [X] T018 [P] [US2] Write Vitest cases for `SettlementForm` and `DashboardPage`: the same `draft_id` on a repeat and a new one after a success; `draft_already_saved` shows the line with "Xem" and "Ghi thành khoản mới".
- [X] T019 [US2] Give `SettlementForm.tsx` the draft identity and pass it through `api/settlements.ts` `createSettlement`. In `DashboardPage.tsx`, handle `draft_already_saved` for the form.
- [X] T020 [P] [US3] Write Vitest cases in `DashboardPage.test.tsx`:
  - A card press, a lost answer and a second press send the same `draft_id`, with `draft_kind: "card"`.
  - A new amount after an answered refusal gets a new id.
  - A new amount after "result unknown" keeps the id until a settlements read shows it.
  - `draft_already_saved` stamps the card.
- [X] T021 [US3] In `lib/usePaidTransfers.ts`, add the `cardDrafts` map (research R4) and send `draft_id` and `draft_kind: "card"` in `createSettlement`.

## Phase 6: Web US5

- [X] T022 [P] [US5] Write a Vitest case in `HouseholdCreateForm.test.tsx`: a double click on "Tạo nhà" sends 1 POST.
- [X] T023 [US5] Add a synchronous `useRef` in-flight guard to `HouseholdCreateForm.tsx` `handleSubmit`.

**Checkpoint (commit 2):** Vitest, lint and tsc are green.

## Phase 7: E2E, docs, checks

- [X] T024 [P] Extend `frontend/e2e/safe-saves.spec.ts` case 2: after the unknown line, press Lưu again. The list has exactly 1 "Nước giặt" row, and the API list has 1 expense.
- [X] T025 [P] Update the docs:
  - `docs/ARCHITECTURE.md`: the `draft_id`, the 200 repeat and `draft_already_saved`;
  - `docs/ACCOUNTS.md`: a line about drafts in S2 and S3;
  - the README migration list, if present.
- [X] T026 Run everything: pytest, ruff, Vitest, lint, tsc, the full local E2E suite and the quickstart by-hand table. Keep `frontend/test-results/` if any run is red.
- [X] T027 Write the results per SC-001 to SC-006 at the end of this file.

## Dependencies

- **Phase 2:** blocks everything.
- **Phase 3:** blocks the web phases (the API contract).
- **Phases 4, 5, 6:** independent of each other.
- **Phase 7:** last.

## Implementation Strategy

- **MVP:** Phases 1–4 (server + expense form) fix E01 for expenses, the case the review found.
- **Then:** repayments (Phase 5), the "Tạo nhà" guard (Phase 6), and Phase 7.

## Results (12/11)

| Check | Result |
|---|---|
| SC-001 | Expense: E2E `safe-saves` case 2 drops the answer after the server committed, presses Lưu again: 1 row in the list and in the API. Repayment by hand and card: pytest repeats get 200 with 1 row, balances moved once, told money taken once |
| SC-002 | Two requests with one identity held on the house and let go together: `[200, 201]` and 1 row for a plain expense, "Ghi kỳ này", a recurring tick (1 item) and told money (never `notice_changed`). Two different recurring ticks at once: both 201. With the old shared lock put back, the two recurring tests fail with a deadlock |
| SC-003 | Repeat of "Ghi kỳ này": 200, not `recurring_month_taken`. Repeat of told money after its notice changed: 200, notice reduced once |
| SC-004 | Changed draft: 409 `draft_already_saved`, nothing changed; "Ghi thành khoản mới" records exactly one more (pytest, Vitest for both forms) |
| SC-005 | Double tap on "Tạo nhà": 1 call (Vitest) |
| SC-006 | pytest 861 passed (40 new in `test_drafts.py`), ruff clean, Vitest 1040 passed, tsc and lint clean (only the warnings already on main), local E2E 36/36 |

Notes:

- **US2 scenario 3** (told money given back by a deletion, then the same draft pressed again) records once more when the press names the notice version now on screen. The page reads the house again after the deletion; a press that still names the old version is refused with `notice_changed`, as any stale told-money press is.
- **Quickstart by-hand table:** every row is covered by the automated checks above (E2E row 1, Vitest rows 2, 3 and 6, pytest rows 4 and 5). It was not repeated by hand with DevTools.