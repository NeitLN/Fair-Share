# Tasks: Monthly report

**Input**: Design documents from `/specs/004-monthly-report/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-contract.md, quickstart.md

**Tests**: Included. Constitution I asks for every sum to be tested and research R7 lists them; test
tasks come before the code they test.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

SPA only: `frontend/src/` and `frontend/e2e/`; docs in `docs/`. No backend file changes.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Open a GitHub issue "Monthly report" linking `specs/004-monthly-report/spec.md`, and note its number for the PR (`Closes #N`); branch stays `feat/monthly-report`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the pure module every story reads, and the strings.

- [X] T002 [P] Write unit tests in `frontend/src/lib/monthReport.test.ts` for every invariant in data-model.md: integers only; `start + paid − share + paidBack − gotBack === end` per line; Σ start = 0 and Σ end = 0; Σ paid = Σ share = total and Σ paidBack = Σ gotBack; each member's end in month A equals their start in the next month; every start 0 in `first`; an empty month has all movements 0 and start === end; with equal and custom splits, a settlement in the month, an item dated after the current month (`laterItems`), and a member who left but appears in an item (line after today's members, by id). Also `monthRange` (no items → current month both ends; later-dated item extends `last`), `clampMonth` (undefined → current; `1999-01` → first; `2026-13`, `abc`, and a month after last → last), `shiftMonth` across a year (`2026-01` −1 → `2025-12`, `2025-12` +1 → `2026-01`), and `inStep` (true when every end of the last month equals the balance `net`, false on a 1 đồng difference, a member missing from balances counts as 0)
- [X] T003 Implement `frontend/src/lib/monthReport.ts` with the signatures in contracts/ui-contract.md (`monthRange`, `clampMonth`, `shiftMonth`, `monthReport`, `inStep`): a month is `spent_at.slice(0, 7)` / `settled_at.slice(0, 7)`; lines in the order of `monthTotals` in `frontend/src/lib/expenseFilters.ts` (today's members, then anyone gone, by id); one pass over expenses and settlements; no React, no I/O; make T002 pass
- [X] T004 [P] Add the `report` block to `frontend/src/i18n/vi.tsx` and `frontend/src/i18n/en.tsx` with the keys in contracts/ui-contract.md (`title(month)`, `open`, `previous(month)`, `next(month)`, `total`, `columns.{who,start,paid,share,paidBack,gotBack,end}`, `totalRow`, `empty`, `laterItems`, `updating`, `loading`, `seeExpenses`); Vietnamese: "Báo cáo tháng", "Cả nhà chi", "Đầu tháng", "Đã chi", "Phần", "Đã trả lại", "Nhận lại", "Cuối tháng", "Đang cập nhật…", "Xem các khoản chi tháng này"

**Checkpoint**: `npm test` passes the new unit tests.

---

## Phase 3: User Story 1 - See how this month moved everyone (Priority: P1) 🎯 MVP

**Goal**: From Tổng quan, one press opens this month's report: total spending and six figures per housemate that add up and end on Tổng quan's balances.

**Independent Test**: Quickstart rows 1–3: open the report from the Tháng block, compare Cuối tháng with Số dư từng người, add up each row.

### Tests for User Story 1

- [X] T005 [P] [US1] Write page tests in `frontend/src/pages/ReportPage.test.tsx` (with `renderApp`, `mockApi`, `onAComputer()`): at `/households/1/report/<current month>` the heading names the month, "Cả nhà chi" shows the month's total, the table has one row per housemate with the six figures and a total row (starts and ends 0), the signed-in member's row has the "Bạn" chip; while a query is pending a skeleton shows and no figure; when a query fails the error note with Thử lại shows and no figure; when the balances differ from the computed ends by 1 đồng, "Đang cập nhật…" shows and no figure; a "Tôi đã chuyển" notice in `mockApi` changes no figure
- [X] T006 [P] [US1] Add a test to `frontend/src/pages/DashboardPage.test.tsx`: the Tháng block has a "Báo cáo tháng" link to `/households/1/report/<current month>`; and to `frontend/src/components/MonthTotals.test.tsx`: no link when `reportTo` is not given (Chi tiêu's use)

### Implementation for User Story 1

- [X] T007 [US1] Create `frontend/src/pages/ReportPage.tsx`: read `householdId` and `month` from the route; use the same query keys as `DashboardPage.tsx` for members (`keys.members`), expenses (`expenseKeys.list`), settlements (`settlementKeys.list`) and balances (`settlementKeys.balances`); compute the range with `today().slice(0, 7)` from `frontend/src/lib/date.ts`, then `monthReport`; render the states of the contract table (skeleton via `Skeleton`, `ErrorNote` with retry, "Đang cập nhật…" plus a refetch of all four when the month is `last` and `inStep` is false); on `useWide()` a `<table className="report-table">` with a caption hidden from view, `<th scope="col">` headers, one row per line (Avatar, short name, `Chip kind="me"`), `Money kind="balance"` for start and end and plain `Money` for the four movements, and a `<tfoot>` total row; below 1024 px one `<li className="report-card">` per line with a `<dl>` of the six figures
- [X] T008 [US1] Register the route `report/:month?` as a child of `households/:householdId` in `frontend/src/App.tsx`, so `HouseholdLayout` shows the not-found page to a stranger or someone waiting, and keep the Tổng quan tab marked active on it in `frontend/src/pages/HouseholdLayout.tsx` (its `NavLink to="" end` must also match `report/*`)
- [X] T009 [US1] Give `frontend/src/components/MonthTotals.tsx` an optional `reportTo?: string` prop that renders a `Link` "Báo cáo tháng" (≥ 44 px tall) under the heading, and pass `reportTo={`/households/${householdId}/report/${thisMonth}`}` from `frontend/src/pages/DashboardPage.tsx`
- [X] T010 [US1] Style `.report-table`, `.report-card`, `.report-head` and `.report-link` in `frontend/src/index.css` with tokens only: money columns right-aligned with tabular figures, the total row separated by `--line`, the current member's row marked the same way as `.balance-row.highlighted`; table only from 1024 px, cards stack below

**Checkpoint**: T005 and T006 pass; quickstart rows 1–3 by hand.

---

## Phase 4: User Story 2 - Go back to earlier months (Priority: P2)

**Goal**: Step month by month through the range; the address keeps the month; Chi tiêu opens on the same month.

**Independent Test**: Quickstart rows 4–7.

### Tests for User Story 2

- [X] T011 [P] [US2] Extend `frontend/src/pages/ReportPage.test.tsx`: "Tháng trước" goes to the previous month and its Cuối tháng equals the Đầu tháng just seen; no "Tháng trước" on the first month (every Đầu tháng 0) and no "Tháng sau" on the last; an empty month in range says nothing happened and start equals end; `…/report` becomes the current month, `…/report/2026-13` and `abc` the last month, `…/report/1999-01` the first, each by replacing the history entry; with an expense dated next month, the current month shows the `laterItems` line and the last month is next month
- [X] T012 [P] [US2] Add a test to `frontend/src/pages/ExpensesPage.test.tsx`: opening Chi tiêu with navigation state `{ month: '2026-10' }` starts the filter on Tháng 10/2026 and its totals; a month with no expense is ignored

### Implementation for User Story 2

- [X] T013 [US2] In `frontend/src/pages/ReportPage.tsx`, apply `clampMonth` and `navigate(…, { replace: true })` when the address is missing or out of range; render previous / next `Link`s (≥ 44 × 44 px, `aria-label` from `report.previous(month)` / `report.next(month)`) only inside the range; show `report.empty` and `report.laterItems` when set
- [X] T014 [US2] Add the "Xem các khoản chi tháng này" link in `frontend/src/pages/ReportPage.tsx` to `/households/:id/expenses` with state `{ month }`, and in `frontend/src/pages/ExpensesPage.tsx` read `location.state.month` once as the starting filter (only if `monthsOf` contains it), then clear the state with `navigate(location.pathname, { replace: true, state: null })` as `revealExpense` does

**Checkpoint**: T011 and T012 pass; quickstart rows 4–7.

---

## Phase 5: User Story 3 - Read it in either language, on any screen (Priority: P3)

**Goal**: English words, phone layout, both themes, all within the a11y rules.

**Independent Test**: Quickstart row 10 and the a11y walk.

### Tests for User Story 3

- [X] T015 [P] [US3] Extend `frontend/src/pages/ReportPage.test.tsx`: in English the heading reads "November 2026"-style month names and the column names are English; without `onAComputer()` the cards render and no table does
- [X] T016 [P] [US3] Add `/households/${id}/report` to the pages walked in `frontend/e2e/a11y.spec.ts` (contrast, 44 px, no sideways scroll at 320/360 px, both themes)

### Implementation for User Story 3

- [X] T017 [US3] Fix whatever T015 and T016 find in `frontend/src/pages/ReportPage.tsx` and `frontend/src/index.css` (long names wrap, 12-digit amounts fit at 320 px and 200% zoom, prev/next stay ≥ 44 px)

**Checkpoint**: T015 passes; T016 passes on a local stack.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T018 [P] Write `frontend/e2e/report.spec.ts` for a local stack only (`E2E_BASE_URL`, `E2E_API_URL`): seed a house with an expense last month, one this month and a settlement, open Tổng quan, follow "Báo cáo tháng", check each Cuối tháng against Số dư từng người, step to the previous month and check its Cuối tháng against this month's Đầu tháng; also check that a stranger's account gets the not-found page at the same address
- [X] T019 [P] Describe the report screen in `docs/DESIGN.md` §6 (where it opens, the six figures, table vs cards, the in-step wait) and add it to the screens list in `README.md` if the README lists screens
- [X] T020 Run `cd frontend && npm run lint && npm test && npm run build`, then the E2E (`report`, `a11y`) against a local Compose stack, never the live site; run `ruff check .` from the root only if a `.py` file changed
- [X] T021 Walk quickstart.md rows 1–10 by hand on the local stack, take before/after screenshots at 1440 and 360 px for the PR, and tick the tasks here

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (T001) → Foundational (T002–T004) → US1 → US2 → US3 → Polish.
- US2 and US3 build on the page from US1 (same file), so they follow it.

### User Story Dependencies

- **US1 (P1)**: needs T003, T004.
- **US2 (P2)**: needs T007, T008 (the page and route).
- **US3 (P3)**: needs T007, T010 (page and styles).

### Within Each User Story

- Tests first and failing, then the code, then the checkpoint.

### Parallel Opportunities

- T002 and T004 (different files).
- T005 and T006; T011 and T012; T015 and T016.
- T018 and T019.

## Parallel Example: User Story 1

```text
T005 ReportPage.test.tsx (page tests)
T006 DashboardPage.test.tsx + MonthTotals.test.tsx (entry link)
```

## Implementation Strategy

### MVP First (User Story 1 Only)

T001–T010 give a working report for the current month opened from Tổng quan; it can be reviewed on
its own.

### Incremental Delivery

One PR for the whole feature (the stories share one page), committed in story order so the history reads
US1 → US2 → US3 → polish.

### Parallel Team Strategy

One person; Minh reviews the PR.

## Notes

- No backend, schema or permission change; if one turns out to be needed, stop and update plan.md first.
- No commit until the owner approves; `.claude/` and `.specify/` are never committed.
