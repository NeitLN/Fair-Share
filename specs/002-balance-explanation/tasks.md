---

description: "Tasks for Why this number? (balance explanation)"
---

# Tasks: Why this number? (balance explanation)

**Input**: Design documents from `/specs/002-balance-explanation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-contract.md, quickstart.md

**Tests**: Included. CONTRIBUTING.md's Definition of Done asks for tests with every behaviour change, and
the project writes them first: each test task must fail before the implementation task after it.

**Organization**: Grouped by user story so each can be built, tested and shown on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- All paths are from the repository root; the feature touches `frontend/` and `docs/` only

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Nothing to install: no new dependency, no config, no schema (plan.md, Technical Context).

- [X] T001 Confirm the branch `feat/balance-explanation` is cut from an up-to-date `main` and `cd frontend && npm ci && npm test` is green before any change

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure function and the copy every story uses.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Write failing unit tests in `frontend/src/lib/explain.test.ts` for the totals: `explain()` returns exactly four lines in the order `spent`, `share`, `paidBack`, `gotBack`, whose `total` are the balance's `paid`, `owed`, `sent`, `received` (whole đồng, ≥ 0), and `net === spent − share + paidBack − gotBack === balance.net` (data-model.md invariants 1, 2); notices never change a total and appear in `waiting` with `otherMemberId`, `amount`, `iSent` only when `status === 'sent'` (invariant 6, research R5)
- [X] T003 Implement `explain(balance, expenses, settlements, notices)` and its types (`LineKind`, `ExplanationLine`, `WaitingNotice`, `BalanceExplanation`) in `frontend/src/lib/explain.ts` as specified in contracts/ui-contract.md, with `items: []` and `inStep: true` for now, until T002 passes
- [X] T004 [P] Add the `explain` copy block (keys `open`, `spent`, `share`, `paidBack`, `gotBack`, `owes`, `gets`, `nothing`, `updating`, `waitingSent`, `waitingTold`, `toExpense`, `toRepayment`) to `frontend/src/i18n/vi.tsx` and `frontend/src/i18n/en.tsx` with the wording of contracts/ui-contract.md; line keys take `(you: boolean, name: string)`; English must pass `frontend/src/i18n/english.test.tsx` (no Vietnamese letters apart from names)

**Checkpoint**: `explain()` is tested; stories can start.

---

## Phase 3: User Story 1 - See how my own balance is made (Priority: P1) 🎯 MVP

**Goal**: From the verdict, "Vì sao ra số này?" opens four signed lines and a total equal to your balance.

**Independent Test**: In `DashboardPage.test.tsx`'s household (Tiến paid 300.000đ for three, net +200.000đ), open "Vì sao ra số này?" and read +300.000đ, −100.000đ, +0đ, −0đ and a total of +200.000đ "Còn được nhận"; it closes with Escape and focus goes back to the summary.

### Tests for User Story 1 ⚠️

- [X] T005 [P] [US1] Write failing component tests in `frontend/src/components/BalanceExplanation.test.tsx`: four rows with labels worded with "bạn" when `me` is the member, each amount with an explicit sign (+ for `spent`/`paidBack`, − for `share`/`gotBack`, a real minus sign "−"), the total with "Còn cần trả" / "Còn được nhận" or SẠCH NỢ at 0 (FR-004, FR-005, FR-006); one line per waiting notice using `waitingSent` / `waitingTold` (FR-011)
- [X] T006 [P] [US1] Write failing page tests in `frontend/src/pages/DashboardPage.test.tsx`: the verdict block has a "Vì sao ra số này?" fold only when your net ≠ 0 (FR-001); opening it shows your explanation whose total equals the balance row's amount (FR-004); Escape closes it and focuses its summary (FR-003); with a "Tôi đã chuyển" notice sent, the waiting line shows and no total changes (FR-011)

### Implementation for User Story 1

- [X] T007 [US1] Create `frontend/src/components/BalanceExplanation.tsx` (props `explanation`, `looks`, `me`, `householdId`; props only) rendering the four lines, the total and the waiting lines with the `Money` component, until T005 passes
- [X] T008 [US1] Add the "Vì sao ra số này?" `<details>` under the big amount in `frontend/src/components/VerdictBlock.tsx` (new optional prop `explanation?: BalanceExplanation`), shown only when the explanation's `net !== 0`, closing on Escape with `closeFoldOnEscape` from `frontend/src/lib/fold.ts`
- [X] T009 [US1] In `frontend/src/pages/DashboardPage.tsx`, build your explanation with `explain()` from the balances, expenses, settlements and notices queries (memoised on them) and pass it to `VerdictBlock`; no explanation while the balances are loading or failed (spec Edge Cases), until T006 passes
- [X] T010 [P] [US1] Style `.explain` in `frontend/src/index.css` on tokens only: lines as rows with right-aligned tabular amounts, the total row separated by `--line`, controls ≥ 44 px (`--target`), readable on the taro block (text on `--on-block`/`--on-block-muted` inside the verdict) and on `--surface` elsewhere

**Checkpoint**: US1 works alone: the verdict explains your own balance.

---

## Phase 4: User Story 2 - See what makes up each line (Priority: P2)

**Goal**: Each non-zero line opens the expenses or repayments behind it, which add up to the line, each leading to where it can be changed.

**Independent Test**: In the seed household as Tiến, "Phần của bạn trong các khoản chi" lists 5 expenses, newest first, whose shares add up to 1.890.000đ; clicking "Mì gói và trứng" opens Chi tiêu with that expense revealed.

### Tests for User Story 2 ⚠️

- [X] T011 [P] [US2] Extend `frontend/src/lib/explain.test.ts` (failing first): `spent` lists expenses with `payer_id` = the member, `part` = whole `amount`; `share` lists expenses with a share > 0 for the member, `part` = that share, and never a 0 đồng share (invariant 4); `paidBack`/`gotBack` list settlements from/to the member; items newest first by date then id; a removed member's id is kept in items (invariant 5); `inStep` is false for a line whose items do not add up to its total, e.g. a balance refreshed before the expense list (invariant 3, research R2)
- [X] T012 [P] [US2] Extend `frontend/src/components/BalanceExplanation.test.tsx` (failing first): each non-zero line is a fold listing its items (expense: description, date, payer, full amount, part; repayment: date, other person, amount, note) (FR-007); a zero line says "Không có khoản nào" and is not a fold (FR-009); a line with `inStep: false` shows "Đang cập nhật…" instead of items (FR-015); no control in the explanation changes data (FR-010)
- [X] T013 [P] [US2] (Written as the whole flow in `frontend/src/pages/DashboardPage.test.tsx`, from the explanation to the revealed row; the filter case cannot happen on arrival.) Write failing tests in `frontend/src/pages/ExpensesPage.test.tsx`: arriving with navigation state `{ revealExpense: id }` clears a month/person filter that hides it, reveals that expense's row and scrolls it into view, then clears the state so a reload does not reveal it again

### Implementation for User Story 2

- [X] T014 [US2] Fill `items` and `inStep` in `frontend/src/lib/explain.ts` per data-model.md (ExpenseItem, RepaymentItem), until T011 passes
- [X] T015 [US2] Render each line as a `<details>` with its item list in `frontend/src/components/BalanceExplanation.tsx`; expense items are `<Link to="/households/{householdId}/expenses" state={{ revealExpense: expenseId }}>`, repayment items are links to `#settlement-{settlementId}`, until T012 passes
- [X] T016 [P] [US2] Add `id={\`settlement-${settlement.id}\`}` to each row in `frontend/src/components/SettlementList.tsx`
- [X] T017 [US2] Read `location.state.revealExpense` in `frontend/src/pages/ExpensesPage.tsx`: reset the filter to `NO_FILTER` when it hides the expense, set the existing `revealId`, scroll the row into view, then `navigate(location.pathname, { replace: true, state: null })`; give rows a stable `id` in `frontend/src/components/ExpenseList.tsx` and `frontend/src/components/ExpenseTable.tsx` if they have none, until T013 passes

**Checkpoint**: US1 and US2 work: every line can be traced to its items and to where they change.

---

## Phase 5: User Story 3 - See a housemate's balance explained (Priority: P3)

**Goal**: Every row of Số dư từng người opens that person's explanation, worded with their name.

**Independent Test**: As Tiến, open Duy Anh's row: +460.000đ, −1.910.000đ, 0đ, 0đ, total −1.450.000đ "Còn cần trả", worded "Duy Anh …".

### Tests for User Story 3 ⚠️

- [X] T018 [P] [US3] Write failing page tests in `frontend/src/pages/DashboardPage.test.tsx`: each row of "Số dư từng người" is a fold whose explanation total equals that row's amount (FR-002); another member's lines use their short name, yours use "bạn" (FR-006); two rows can be open at once

### Implementation for User Story 3

- [X] T019 [US3] Make each row of `frontend/src/components/BalanceRows.tsx` a `<details>` (the existing avatar, name and standing as its `<summary>`, a drawn chevron like the other folds) with `BalanceExplanation` inside; new optional props `explanations?: Map<number, BalanceExplanation>` and `householdId`; Escape closes with `closeFoldOnEscape`
- [X] T020 [US3] Build one explanation per member in `frontend/src/pages/DashboardPage.tsx` (memoised) and pass them to `BalanceRows`, until T018 passes

**Checkpoint**: All three stories work independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T021 [P] Extend `frontend/e2e/a11y.spec.ts` to open "Vì sao ra số này?" and one line on the household it already creates, so the existing contrast, 44 px and keyboard checks cover the explanation (FR-014, SC-004)
- [X] T022 [P] Describe the explanation in `docs/DESIGN.md` §6.2 (Tổng quan): where it opens, the four lines, the items, "Đang cập nhật…", the waiting-notice line, with a small sketch
- [X] T023 Run every check: `cd frontend && npm run lint && npm test && npm run build`, then the three E2E specs against a local stack (`E2E_BASE_URL`/`E2E_API_URL` on the stack, never the live site)
- [X] T024 Walk quickstart.md by hand on a fresh `docker compose up --build` (steps 1–8), at 1440 and 360 px, light and dark, Vietnamese and English; no sideways scroll at 320/360 px

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none
- **Foundational (Phase 2)**: after Setup; blocks every story (all use `explain()` and the copy)
- **US1 (Phase 3)**: after Phase 2
- **US2 (Phase 4)**: after Phase 2; renders inside the component from T007, so in practice after US1
- **US3 (Phase 5)**: after Phase 2 and T007 (reuses `BalanceExplanation`); independent of US2
- **Polish (Phase 6)**: after the stories to ship

### Within Each Story

- Tests first, and they must fail
- `lib/explain.ts` before the component, the component before the pages
- Story complete before the next priority

### Parallel Opportunities

- T004 alongside T002/T003 (different files)
- T005 and T006 together; T010 alongside T007–T009
- T011, T012, T013 together; T016 alongside T014/T015
- T021 and T022 together

---

## Parallel Example: User Story 2

```bash
Task: "Extend frontend/src/lib/explain.test.ts with item tests (T011)"
Task: "Extend frontend/src/components/BalanceExplanation.test.tsx with item list tests (T012)"
Task: "Write ExpensesPage reveal tests in frontend/src/pages/ExpensesPage.test.tsx (T013)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phases 1 and 2
2. Phase 3 (US1): the verdict explains your own balance
3. Stop and check with quickstart.md steps 1, 6, 7
4. Can ship as its own PR if review time is short

### Incremental Delivery

1. US1 → the most asked question is answered
2. US2 → each line can be traced to its items
3. US3 → any housemate's balance can be checked
4. One PR is fine for all three (the diff stays small); split per story if review asks for it

---

## Notes

- No backend, API or schema change: if a task seems to need one, stop and revisit research.md R1
- Every amount is whole đồng; never format or sum with floats
- Commit with the author's own identity, Conventional Commits, `Refs #<issue>`
