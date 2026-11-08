# Tasks: Telling the amount actually sent

**Input**: Design documents from `specs/014-partial-transfer-notices/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, contracts/ui-contract.md, quickstart.md

**Tests**: requested by the spec (SC-003, SC-005 and the acceptance scenarios), written before the code they check.

**Organization**: two PRs. PR-1 = Setup, Foundational and US3 (recording is safe). PR-2 = US1, US2, US4 (the
debtor's side). Each PR is shippable alone; PR-2 starts from main after PR-1 is merged.

## Format: `[ID] [P?] [Story] Description`

---

## PR-1: Recording is safe

### Phase 1: Setup

- [X] T001 Open a GitHub issue "Notices: versions, partial confirmation, told money by hand (spec 014, PR-1)" with US3 and FR-007 to FR-011a as done criteria; branch `feat/014-safe-recording` from `main`

### Phase 2: Foundational (blocks every story)

- [X] T002 Write `db/migrations/010_partial_notices.sql`: `CREATE SEQUENCE notice_versions`; `ALTER TABLE payment_notices ADD COLUMN note text CHECK (char_length(note) <= 120), ADD COLUMN version bigint NOT NULL DEFAULT nextval('notice_versions'), ADD CONSTRAINT payment_notices_amount_max CHECK (amount <= 1000000000000)`; `ALTER TABLE settlements ADD COLUMN notice_amount bigint CHECK (notice_amount > 0 AND notice_amount <= amount)`; a header comment saying what each column means (data-model.md)
- [X] T003 [P] In `app/routers/households.py` give `lock_household(conn, household_id, shared=False)` a shared mode (`FOR SHARE`) and document R2 of research.md in its docstring
- [X] T004 In `app/routers/expenses.py` (create, update, delete) and `app/routers/settlements.py` (create, delete) take `lock_household(..., shared=True)` before writing; pytest in `tests/test_settlements.py`: an expense saved while another connection holds the house `FOR UPDATE` waits for it (two connections)
- [X] T005 In `app/schemas.py`: `Notice` gains `note: str | None` and `version: int`; `Settlement` gains `notice_amount: int | None`; `NoticeVersion = Annotated[StrictInt, Field(ge=1, le=BIGINT_MAX)] | None`; `NoticeIn` gains `version: NoticeVersion` and `note: text(120, min_length=0) | None = None` (trimmed, line breaks folded to spaces, blank → None); `NoticeAnswer` becomes `{version: NoticeVersion}` (non-null); `NoticeAccept` = `{version, received: Amount | None = None, settled_at: Day}`; `SettlementIn` gains `notice: NoticeRef | None = None` with `NoticeRef = {version: int}`
- [X] T006 In `app/routers/settlements.py` add `NOTICE_COLUMNS` with `note, version`; a helper `current_notice(conn, hid, from, to, lock=True)` (`FOR UPDATE`); a helper `expect_version(notice, version)` raising 409 `notice_changed` when `version` is None while a notice exists, a number while none exists, or a different number; every UPDATE of a notice sets `version = nextval('notice_versions')`

### Phase 3: User Story 3 - The receiver got only part of it (Priority: P1)

**Goal**: confirming all or part, told money by hand, versions on every action, give-back on delete.

**Independent Test**: tell, confirm a smaller amount, the rest waits; record by hand as told money, the notice
shrinks; as another repayment, it stays; delete a repayment from a notice, it comes back when the pair has none.

- [X] T007 [US3] pytest in `tests/test_notices.py` (write first, red): accept with `received` < amount records exactly it and leaves amount − received waiting with a new version; `received` > amount → 422; accept/decline/take back with a stale version → 409 and nothing changes; accept twice with the same version → one repayment; two connections accepting the same version → one repayment; decline keeps amount and note
- [X] T008 [US3] pytest in `tests/test_settlements.py` (write first, red): repayment with `notice: {version}` of 1.000.000 on a notice of 1.060.000 → `notice_amount` 1.000.000, notice 60.000; of 1.500.000 → `notice_amount` 1.060.000, notice gone; with a stale version → 409, no repayment; without `notice` → notice unchanged (today's equal-amount removal dropped); a declined notice reduced stays declined; manual-as-told and accept on two connections never record more than told (SC-003)
- [X] T009 [US3] pytest in `tests/test_notices.py` (write first, red): deleting a repayment with `notice_amount` when the pair has no notice creates a `sent` notice of that amount (no note); when the pair has a notice, it is left unchanged; deleting a repayment without `notice_amount` touches no notice
- [X] T010 [US3] Implement in `app/routers/settlements.py`: `accept_notice` with `received` (default the amount, 1..amount), repayment `notice_amount = received`, note copied when the repayment has none, notice reduced or deleted, under the shared house lock then `FOR UPDATE` on the notice; `decline_notice` and `cancel_notice` (`?version=` query) check the version
- [X] T011 [US3] Implement in `app/routers/settlements.py` `create_settlement` with `notice`: lock the notice, `expect_version`, `notice_amount = min(amount, notice.amount)`, reduce or delete; remove the equal-amount DELETE; `delete_settlement`: when `notice_amount` and no notice for the pair, insert a `sent` notice of that amount
- [X] T012 [US3] `send_notice` in PR-1: require and check `version` (null when none); the amount rule stays "equal to the suggestion" until PR-2; take `lock_household(..., shared=False)` before computing the transfers; pytest: telling with a stale version → 409
- [X] T013 [P] [US3] Frontend API in `frontend/src/api/settlements.ts` and `frontend/src/api/types.ts`: `Notice.note`, `Notice.version`, `Settlement.notice_amount`; `sendNotice(hid, to, amount, version)`, `cancelNotice(hid, to, version)`, `acceptNotice(hid, from, {version, received?, settled_at})`, `declineNotice(hid, from, version)`, `createSettlement(..., notice?: {version})`; Vitest in `frontend/src/api/settlements.test.ts` for the bodies
- [X] T014 [US3] Create `frontend/src/components/NoticeAmountStep.tsx`: amount field read with `parseAmount` from `lib/split.ts` and "= …đ" under it, optional note (`maxLength 120`, can be hidden), max value, a summary line slot, [primary] [Huỷ]; Enter sends, Escape closes and returns focus to the opener; errors under the field (`aria-describedby`); on a 409 the step stays open with what was typed; Vitest in `NoticeAmountStep.test.tsx`
- [X] T015 [US3] In `frontend/src/components/VerdictBlock.tsx` (receiver card): pass `version` to every action; add "Nhận số khác" opening `NoticeAmountStep` (default the told amount, max it); show the note; Vitest in `frontend/src/pages/DashboardPage.test.tsx`: partial confirmation sends `received`, a 409 reloads notices and balances
- [X] T016 [US3] In `frontend/src/lib/usePaidTransfers.ts`: a per-pair `recording` state; `owed` keeps the pair until refetched balances arrive; 409 → refetch notices and balances; unknown outcome (network error) → refetch both before enabling the buttons; Vitest in `usePaidTransfers.test.tsx`: a partial confirmation never shows "sạch nợ" before the balances arrive
- [X] T017 [US3] In `frontend/src/components/SettlementForm.tsx`: when the chosen payer has a notice to me, radio "Đây là tiền {payer} đã báo ({told})" (default) / "Khoản khác"; the first sends `notice: {version}`; a 409 shows the reason and keeps the form; Vitest in `SettlementForm.test.tsx`
- [X] T018 [US3] In `frontend/src/components/SettlementList.tsx`: before deleting a repayment with `notice_amount`, ask with the two sentences of ui-contract.md (comes back / does not come back) depending on whether the pair has a notice; Vitest in `SettlementList.test.tsx`
- [X] T019 [P] [US3] Words in `frontend/src/i18n/vi.tsx` and `en.tsx` (groups `verdict`, `settle`): `receiveOther` "Nhận số khác", `recordThis` "Ghi số này", `toldMoney` / `otherRepayment`, `deleteGivesBack`, `deleteNoGiveBack`, `recording` "Đang ghi…"
- [X] T020 [US3] Docs: `docs/ACCOUNTS.md` S2 and S3 (versions, partial confirmation, told money by hand, give-back, no equal-amount removal); `docs/ARCHITECTURE.md` API table rows for the changed endpoints
- [X] T021 [US3] E2E `frontend/e2e/notices.spec.ts` (shared accounts): Lan tells, Tiến "Nhận số khác" a part, the rest waits; then "Hoàn tác" gives it back

**Checkpoint PR-1**: `ruff check .`, pytest, lint, Vitest, build, local E2E; quickstart steps 1 to 5. Open PR-1.

---

## PR-2: Telling what was sent

### Phase 4: Setup

- [X] T022 Open a GitHub issue "Notices: tell a part with a note, Báo thêm, còn thiếu (spec 014, PR-2)"; branch `feat/014-tell-part` from `main` after PR-1 is merged

### Phase 5: User Story 1 - Tell the amount actually sent (Priority: P1)

**Goal**: full amount in one press; "Chuyển số khác" with any amount up to the suggestion and a note.

**Independent Test**: tell a smaller amount with a note; the receiver sees both; confirming moves the balances by
exactly that amount.

- [X] T023 [US1] pytest in `tests/test_notices.py` (first, red): telling 1đ..suggestion with a note → 200; 0, a string, `true`, 1.5, above the suggestion, above 10^12 → 422 or 409 `suggestion_changed`; the note is trimmed, line breaks folded, blank → null, 121 characters → 422; an expense saved during a telling cannot let it pass the new ceiling (two connections)
- [X] T024 [US1] In `app/routers/settlements.py` `send_notice`: allow `1 <= amount <= suggested` instead of equality; store `note`; version check before the ceiling (`notice_changed` wins)
- [X] T025 [US1] In `frontend/src/components/VerdictBlock.tsx` (debtor action): keep [Tôi đã chuyển {current} cho {to}] one press; add the link "Chuyển số khác" opening `NoticeAmountStep` (default the suggestion, max it, note); above 10^12 the button says the limit and opens the step; Vitest in `DashboardPage.test.tsx` (US1 scenarios 1 to 4, 6)
- [X] T026 [P] [US1] Words in `vi.tsx` and `en.tsx` (`verdict`): `tellOther` "Chuyển số khác", `noteLabel` "Ghi chú (không bắt buộc)", `amountTooLarge`, errors

### Phase 6: User Story 2 - A notice that no longer matches says what is left (Priority: P1)

**Goal**: "còn thiếu" with "Báo thêm"; "nhiều hơn"; "không còn gợi ý"; never a plain "chờ xác nhận" when they differ.

**Independent Test**: tell, raise the debt, both lines show two numbers; "Báo thêm" adds and the total is confirmed once.

- [X] T027 [US2] pytest in `tests/test_notices.py` (first, red): `POST …/notices/{to}/add` adds to a `sent` notice with the version; on a declined or missing notice → 409 `notice_changed`; total above the suggestion → 409 `suggestion_changed`; above 10^12 → 422; a note replaces only when given; a stale accept after an add → 409
- [X] T028 [US2] Implement `add_to_notice` in `app/routers/settlements.py` (household lock `FOR UPDATE`, version, ceiling, total ≤ 10^12)
- [X] T029 [US2] `frontend/src/api/settlements.ts` `addToNotice(hid, to, {amount, note?, version})`; in `VerdictBlock.tsx` the payer lines of ui-contract.md (told = current, told < current with [Báo thêm] hidden at 10^12, told > current, pair not suggested, declined) and the receiver's "· lúc này {payer} cần trả bạn {current}"; "Báo thêm" opens `NoticeAmountStep` with the line "{told} + {x} = {total}"; Vitest in `DashboardPage.test.tsx` (US2 scenarios 1 to 5)
- [X] T030 [US2] In `frontend/src/lib/verdict.ts` the reminder names the told amount, and "(đã báo chuyển {told})" when the pair is not suggested; Vitest in `lib/verdict.test.ts`
- [X] T031 [P] [US2] Words (`verdict`): `toldShort` "Đã báo {told}, còn thiếu {rest}", `toldMore`, `toldNotSuggested`, `addMore` "Báo thêm", `sumLine`, `receiverCurrent`

### Phase 7: User Story 4 - Why the suggestion is one transfer to one person (Priority: P2)

**Goal**: one line under the debtor's action, linking to the existing explanation.

**Independent Test**: in a house where the suggestion crosses people, the line shows once and opens "Vì sao ra số này?".

- [X] T032 [US4] In `VerdictBlock.tsx` render the line once under the debtor's action, with a button that opens the existing `explain-fold`; Vitest in `DashboardPage.test.tsx`; words `combinedHint` in `vi.tsx` and `en.tsx`

### Phase 8: Polish (PR-2)

- [X] T033 Docs: `docs/ACCOUNTS.md` S3 (any amount up to the suggestion, note, Báo thêm); `docs/DESIGN.md` §6.2 (the payer and receiver lines, the steps) and §7 (Đã báo, còn thiếu, Báo thêm, Chuyển số khác, Nhận số khác)
- [X] T034 E2E in `frontend/e2e/notices.spec.ts`: Lan "Chuyển số khác" 1tr with a note, Tiến sees it; an expense raises the debt; "còn thiếu" and "Báo thêm"; Tiến confirms the total once
- [ ] T035 Accessibility pass at 320 px and 200% zoom on the steps (44 px, focus back to the opener, totals read once); `frontend/e2e/a11y.spec.ts` stays green
- [ ] T036 Quickstart steps 6 to 10 by hand, screenshots at 360 and 1440 px in the PR; after merge, the live E2E run green

---

## Dependencies & Execution Order

- PR-1: T002 → T003/T005 → T004/T006 → T007–T009 (red) → T010–T012 (green) → T013 → T014 → T015–T018 → T019–T021.
- PR-2 starts after PR-1 is merged: T023 → T024 → T025; T027 → T028 → T029; T030 and T032 independent; T033–T036 last.
- Spec 012 PR-L (house list, expense list, filters): no shared behaviour; `vi.tsx`, `en.tsx` and `index.css` merge by
  rebasing.

## Parallel Opportunities

- PR-1: T003 and T005 together; T013 and T019 alongside T010–T012.
- PR-2: T026, T031 alongside their story's code; T030 and T032 alongside US2.

## Implementation Strategy

1. PR-1 first: it fixes the double counting that exists today and gives every action a version.
2. PR-2: the debtor's side (US1, US2), then the explanation line (US4).
