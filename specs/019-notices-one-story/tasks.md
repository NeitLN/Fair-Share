# Tasks: Notices tell one story

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [contracts/ui-contract.md](contracts/ui-contract.md), [quickstart.md](quickstart.md)

**Tests**: requested (spec SC-006). Tests are written first in each phase and must fail before the code that makes them pass.

**Delivery**: one PR, `feat/019-notices-one-story`, cut from main after #295 is merged. It has three commits:

1. server (Phases 1–2);
2. client US1 + US2 (Phases 3–4);
3. client US3–US5 and docs (Phases 5–8).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Create branch `feat/019-notices-one-story` from `main` once #295 is merged. Confirm green before any change: `python -m pytest tests/test_notices.py -q`, `ruff check .`, and `npx vitest run` in `frontend/`.
- [X] T002 [P] Add the `notices` block of new lines to `frontend/src/i18n/vi.tsx` and `en.tsx`, word for word from `contracts/ui-contract.md`. It covers the card lines, the warnings, the dialog lines, the race lines, the fill button lines, and "Đang báo…".

## Phase 2: Foundational (server, blocks US1 and US2)

- [X] T003 [P] In `tests/test_notices.py`, write failing tests for FR-006 (accept):
  - **At or under the suggestion:** recorded as today.
  - **Above it, without `warned_suggestion`:** 409 `warning_required`, with `details.suggestion` equal to the current suggestion (0 for an unmatched pair). Nothing is written.
  - **Above it, with the wrong `warned_suggestion`:** 409 `suggestion_changed`, nothing written.
  - **Above it, with the right `warned_suggestion`:** recorded, and the notice is reduced as today.
  - **Version mismatch:** still `notice_changed`.
  - **Interleave (two connections, the spec 014 helpers):** two accepts on different pairs that together would pass the suggestions. The second one sees the first one's result and is refused.
- [X] T004 [P] In `tests/test_notices.py`, write failing tests for FR-007 and FR-008 (delete):
  - **Pair has a sent notice:** sent 13.333 plus a deleted repayment with notice_amount 20.000 gives 33.333, a new version, the same note and author.
  - **Pair has no notice:** gives a sent notice of 20.000.
  - **Pair has a declined notice:** declined 10.000 gives sent 30.000, a new version, the same note and author.
  - **Member gone:** a member of the pair removed leaves no notice change.
  - **Over the limit:** a resulting amount above 10¹² gives 422 `amount_too_large`, and the repayment is still there.
  - **Old test:** replace the spec 014 test that expected an existing notice to stay unchanged.
- [X] T005 [P] In `tests/test_notices.py`, write failing interleave tests for FR-009 (two connections, both orders). A deletion against each of the following must never count told money twice or lose it:
  - accept;
  - add;
  - decline;
  - take-back;
  - a second deletion of another repayment of the same pair.
- [X] T006 In `app/schemas.py`, give `NoticeAccept` a field `warned_suggestion: int | None = Field(default=None, ge=0, le=MAX_AMOUNT)`. In `app/routers/settlements.py`, add `warning_required(suggestion: int) -> ApiError` (409, details `{"suggestion": suggestion}`).
- [X] T007 In `app/routers/settlements.py` `accept_notice`, implement R1:
  - take the exclusive lock (`lock_household(conn, household_id)`);
  - compute the balances and `suggested_amount`;
  - apply the check order from `contracts/api.md`;
  - leave the rest as today.
- [X] T008 In `app/routers/settlements.py` `delete_settlement`, implement R2:
  - take the exclusive lock;
  - lock the settlement row, then the pair's notice row;
  - do one upsert (`ON CONFLICT DO UPDATE SET amount = amount + EXCLUDED.amount, status = 'sent', version = nextval('notice_versions')`);
  - check the 10¹² limit on the returned amount, raising `amount_too_large` so the transaction rolls back;
  - keep the members-exist guard;
  - update the docstring.
- [X] T009 [P] Update the `lock_household` docstring in `app/routers/households.py` so it says that answering a notice now takes the exclusive lock.

**Checkpoint (commit 1):** T003–T005 pass, the whole pytest suite is green, and `ruff check .` is clean.

## Phase 3: User Story 1 - A notice that no longer matches never reads as a debt (P1)

**Goal:** classify notices against the suggestions. Unmatched notices get their own lines and actions. Recording above a suggestion takes two steps and is checked by the server.

**Independent test:** quickstart rows 1–3 by hand, plus `notices.spec.ts` "unmatched notice".

- [X] T010 [P] [US1] Create `frontend/src/lib/notices.test.ts`. `classify()` returns:
  - `matched` when the suggestion is at least the amount;
  - `over` with the excess when 0 < suggestion < amount;
  - `unmatched` with excess = amount when there is no suggestion in that direction, including when the suggestion runs the other way.
- [X] T011 [US1] Create `frontend/src/lib/notices.ts` with `classify(notice, suggested)` (R3), as tested in T010.
- [X] T012 [P] [US1] In `frontend/src/components/VerdictBlock.test.tsx` (or `DashboardPage.test.tsx`), test the unmatched notice:
  - **Lines:** each of receiver, debtor (sent and declined) and other member gets its own line, and no line says "cần trả" for that pair.
  - **Cards:** the card shows even when the pair has a paid card.
  - **Actions:** "Không ghi khoản này" declines. "Vẫn ghi đã nhận" warns and records only on "Ghi". "Thôi" goes back.
  - **Withdrawn warning:** the warning disappears when the notice version or the suggestion changes.
- [X] T013 [P] [US1] Test the over part in `DashboardPage.test.tsx`:
  - "Xác nhận đã nhận" with an over part warns first, naming the suggestion and the excess.
  - "Nhận số khác" with an amount at or under the suggestion sends at once; above it, it warns.
  - A `warning_required` answer turns into the warning, not an error.
- [X] T014 [US1] In `frontend/src/api/settlements.ts`, let `acceptNotice` take an optional `warnedSuggestion`, sent as `warned_suggestion`.
- [X] T015 [US1] In `frontend/src/components/VerdictBlock.tsx`:
  - build notice cards from `classify()` for every sent and declined notice (R3, replacing the rule that only builds told cards when no other card has that pair);
  - render the unmatched lines and actions from the UI contract;
  - add the warning state (R4) for unmatched and over cards, and for "Nhận số khác";
  - leave matched notices as today.
- [X] T016 [US1] In `frontend/src/lib/usePaidTransfers.ts`:
  - `pay` / `record` pass `warnedSuggestion`;
  - a 409 `warning_required` returns its suggestion to the card, which shows the warning (no panel error);
  - `suggestion_changed` / `notice_changed` go to the race line (US4).

**Checkpoint:** US1 tests pass, and the quickstart US1 rows check out by hand.

## Phase 4: User Story 2 - Deleting a repayment gives back what was told (P1)

**Goal:** the history dialog says what the server now does (the server part is Phase 2).

**Independent test:** quickstart row 4, plus `notices.spec.ts` "add-back".

- [X] T017 [P] [US2] Write the tests in `frontend/src/components/SettlementList.test.tsx` (or `DashboardPage.test.tsx`). The dialog for a repayment with `notice_amount` shows:
  - with a sent notice loaded: the add-back line with the total;
  - with a declined notice loaded: the declined line;
  - otherwise: the conditional line.

  It never shows "thông báo khác".
- [X] T018 [US2] In `frontend/src/components/SettlementList.tsx`, write the dialog from the UI contract, using the pair's notice when loaded.
- [X] T019 [P] [US2] In `frontend/e2e/notices.spec.ts`, add "add-back": tell 33.333, record 20.000 by hand from the told money, delete it, and the notice is 33.333 again on both pages.

**Checkpoint (commit 2):** US1 and US2 pass, including E2E on the local stack.

## Phase 5: User Story 3 - The debtor's block says it once (P2)

- [X] T020 [P] [US3] Test in `DashboardPage.test.tsx`:
  - the partial row line matches the block;
  - with one suggestion there is no repeated row;
  - there is one "Vì sao ra số này?";
  - the busy label is "Đang báo…";
  - the QR-missing line is not bold;
  - the history row has no "Xoá" while its card offers "Hoàn tác", and "Xoá" comes back after.
- [X] T021 [US3] In `frontend/src/components/VerdictBlock.tsx`:
  - the row status uses the partial wording (FR-013);
  - drop the repeated row (FR-014) and the second "Vì sao" (FR-015);
  - set the "Đang báo…" label on the debtor's controls (FR-017).
- [X] T022 [US3] In `frontend/src/lib/usePaidTransfers.ts`, expose the settlement ids that have a live card undo. Pass them from `frontend/src/pages/DashboardPage.tsx` to `SettlementList.tsx`, which hides "Xoá" for them (FR-016).
- [X] T023 [P] [US3] In `frontend/src/index.css`, confirm the `.debtor-qr-missing` rule from #293 gives regular weight and muted colour (FR-018); adjust if not.

## Phase 6: User Story 4 - Presses and races (P2)

- [X] T024 [P] [US4] Write the tests in `frontend/src/lib/notices.test.ts`: `raceLine(before, after, pair)` returns the declined, confirmed, taken-back and generic lines as the UI contract says, including the declined case on an unmatched pair.
- [X] T025 [P] [US4] Test in `DashboardPage.test.tsx`:
  - a double tap on "Tôi đã chuyển" sends 1 PUT and shows no error;
  - a press while the receiver's confirm on the same pair is pending is ignored;
  - after a 409 and a refetch, the race line replaces the 409 text and clears after 10 s (fake timers) or on the next press;
  - a failed refetch shows the retry line.
- [X] T026 [US4] In `frontend/src/lib/notices.ts`, add `raceLine()` (R6).
- [X] T027 [US4] In `frontend/src/pages/DashboardPage.tsx`:
  - one busy-pair `Set` (R5), checked synchronously by every notice action and shared with `usePaidTransfers` (replacing its own `recording` set for notice pairs);
  - a pair stays busy after an `outcome_unknown` until the next successful read;
  - take the snapshot at each press, and after a 409 refetch notices and settlements, then show `raceLine()` with a 10 s clear.

## Phase 7: User Story 5 - Telling the right amount (P3)

- [X] T028 [P] [US5] In `frontend/src/components/NoticeAmountStep.test.tsx` and `DashboardPage.test.tsx`:
  - owing 133.333, typing 135000 shows "Bạn chỉ cần trả An 133.333đ." with "Báo 133.333đ", which fills 133333 and keeps the focus;
  - "Báo thêm" uses `min(s − told, 10¹² − told)`;
  - when the 10¹² cap binds there is no button, only the limit message;
  - when max ≤ 0, it says "Bạn đã báo đủ số cần trả."
- [X] T029 [US5] In `frontend/src/components/NoticeAmountStep.tsx`, add the `fill` prop (R8). In `VerdictBlock.tsx` `DebtorAction`, compute `max` and pass it.
- [X] T030 [P] [US5] In `frontend/e2e/notices.spec.ts`, add "fill": type 135000, press "Báo 133.333đ", then Gửi, and the notice is 133.333.

## Phase 8: Polish

- [X] T031 [P] Update `docs/ACCOUNTS.md` S3 for the warned accept and the add-back. In `specs/014-partial-transfer-notices/spec.md`, add a note under FR-011a: "Superseded by spec 019 FR-007."
- [X] T032 Run everything:
  - `python -m pytest -q` and `ruff check .`;
  - `npm test`, `npm run lint` and `npx tsc -b --noEmit` in `frontend/`;
  - the full E2E suite on the local stack;
  - the quickstart by-hand table at 360 px.

  If a run is red, keep `frontend/test-results/` before rerunning.
- [X] T033 Write the results per SC-001 to SC-006 at the end of this file.

## Dependencies

- **Phase 2 (server)** blocks US1 (the warned accept) and US2 (the add-back).
- **US1 → US2:** US2 only needs Phase 2 and can run alongside US1.
- **US3, US4, US5:** each needs US1's `notices.ts`. They can then run in any order, but they touch `VerdictBlock` / `DashboardPage`, so they are done one after another in this single PR.
- **Parallel:** the test tasks marked [P] in each phase; T009 and T023 are separate files.

## Implementation Strategy

- **MVP:** Phases 1–4 (server + US1 + US2) fix the two money-trust problems (C02, C03). They could ship on their own.
- **Then:** US3–US5 are the polish on the same screen.

---

## Results (12/11/2026, local stack at the branch head, on main 5e09cc9)

| Check | Result |
|---|---|
| pytest (real PostgreSQL) | 821 passed (16 new in `test_notices.py`; the spec 014 FR-011a test replaced) |
| ruff | clean |
| Vitest | 1028 passed (1025 before this spec's client part) |
| lint, tsc | clean |
| E2E, whole suite on the local stack | 36 passed (2 new in `notices.spec.ts`; `smoke.spec.ts` step 6 updated for FR-014) |

| Criterion | Result | Evidence |
|---|---|---|
| SC-001 unmatched notice never reads as a debt; two presses; stale "Ghi" refused | Met | `DashboardPage.test.tsx` "…said for what it is"; pytest `test_a_notice_no_longer_suggested…`, `test_a_warning_about_an_old_suggestion…` |
| SC-002 add-back 33.333 → 33.333 again; interleaves never lose or double | Met | pytest `test_deleting_gives_the_told_money_back…`, `test_deleting_after_not_received…`, `test_a_deletion_and_another_answer_at_once…` (5 cases, run 5×); E2E "deleting a repayment taken from told money…" |
| SC-003 one story in the debtor block | Met | `DashboardPage.test.tsx` (no repeated row, one "Vì sao", at most 2 undo controls) |
| SC-004 double tap sends once; lost race says who did what and clears | Met for the payer's actions | `DashboardPage.test.tsx` "presses and races on a notice" |
| SC-005 135000 → "Báo 100.000đ" → tells exactly | Met | `DashboardPage.test.tsx` "telling the right amount"; E2E "telling more than owed…" |
| SC-006 money exact, suites green | Met | above |

**Where the build differs from the plan, and why:**

- **FR-020 (race lines):** implemented for the notice actions (send, Báo thêm, take back, decline). A refused confirmation from the receiver's card (through `usePaidTransfers`) still shows today's 409 text. It does not lose or record money, and the card reloads. It can follow in a small PR.
- **FR-013 (partial row):** the debtor's row shows "Đã báo …, còn thiếu …" only when the debtor has two or more suggestions, because with one the row is not shown at all (FR-014). There is no separate test for that wording.
- **FR-005 (warning withdrawn):** implemented, by comparing the notice version and the suggestion on every render. There is no separate test.
- **"Nhận số khác" warning:** shown inside the step. The same amount pressed again records it with the suggestion it named.
- **Race line on an unmatched declined pair:** the panel says "Số liệu vừa thay đổi, đã tải lại.", because the card itself carries the FR-004a line.