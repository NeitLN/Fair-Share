# Tasks: Expense categories and a chart per month

**Input**: Design documents from `/specs/005-expense-categories/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, contracts/ui-contract.md, quickstart.md

**Tests**: Included (constitution I and III; research R6). Test tasks come before the code they test.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

API in `app/`, migrations in `db/migrations/`, backend tests in `tests/`, SPA in `frontend/src/`, E2E in `frontend/e2e/`.

---

## Phase 1: Setup

- [X] T001 Open a GitHub issue "Expenses have no category, and a month cannot show where the money went" linking `specs/005-expense-categories/spec.md`; note its number for the PR (`Closes #N`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the column, the API field and the shared category module every story reads.

- [X] T002 Write backend tests in `tests/test_expenses.py`: create without `category` → response and row `"other"`; create with `"utilities"` → returned and stored; `PUT` changes it; `"Food"`, `""`, `3` and `null` → `422 validation_error` with `details[].loc == ["body", "category"]` and nothing saved; the list and the single `GET` carry `category`; a member who may not change an expense gets the same 403/404 when the body only changes `category`; balances for the same expenses are identical whatever their categories
- [X] T003 Create `db/migrations/005_expense_categories.sql`: `ALTER TABLE expenses ADD COLUMN category text NOT NULL DEFAULT 'other' CHECK (category IN ('food', 'groceries', 'utilities', 'rent', 'transport', 'household', 'other'));` with a header comment in the style of 004; check `tests/test_migrate.py` still passes on a fresh database
- [X] T004 Add `Category = Literal["food", "groceries", "utilities", "rent", "transport", "household", "other"]` to `app/schemas.py`; `ExpenseIn.category: Category = "other"`; `Expense.category: Category`; leave `ExpenseDraft` unchanged
- [X] T005 Carry the category in `app/routers/expenses.py`: `SELECT_EXPENSES` selects `e.category`; the `INSERT` and the `UPDATE` write `body.category` (parameterised); make T002 pass; run `ruff check .` from the root
- [X] T006 Give the demo expenses their categories in `db/seed.sql` (Tiền nhà tháng trước → rent, Đi chợ cuối tuần → groceries, Tiền điện → utilities, Lẩu thứ sáu → food, Mì gói và trứng → groceries)
- [X] T007 [P] Add `Category` and `category` to `Expense` (required) and `ExpenseInput` (optional) in `frontend/src/api/types.ts`; update test fixtures that build expenses if `tsc -b` asks for the field
- [X] T008 [P] Write `frontend/src/lib/categories.test.ts`: `guessCategory` for every seed description (rent, groceries, utilities, food, groceries), "Tiền nước tháng 11" → utilities, "nuoc mam" → groceries, "Mua bóng đèn" → household, "LAU NUONG" and "lẩu nướng" → food, "quần áo" → other, "" → other, "cafe" → food (not groceries); `categoryTotals` sums to the month's total, percentages sum to 100 for 3 equal categories (34/33/33) and for one tiny category (`tiny: true`, "<1%"), ordered by amount then by `CATEGORIES` order
- [X] T009 Implement `frontend/src/lib/categories.ts` per contracts/ui-contract.md and the word table in research.md R3 (accent-free, whole words or phrases, first category in FR-001 order wins); make T008 pass
- [X] T010 [P] Add the `categories` block (seven names, `label`, `change`, `chartTitle`, `share(percent)`, `tiny`), `filters.category` and `csv.category` to `frontend/src/i18n/vi.tsx` and `frontend/src/i18n/en.tsx`

**Checkpoint**: `pytest -q`, `ruff check .`, `npm test` pass.

---

## Phase 3: User Story 1 - Each expense has a category, with no extra step (Priority: P1) 🎯 MVP

**Goal**: The form preselects a category from the description, the user can change it in two presses, it is saved and shown in every list.

**Independent Test**: Quickstart rows 1–5.

### Tests for User Story 1

- [X] T011 [P] [US1] Extend `frontend/src/components/ExpenseForm.test.tsx`: typing "Tiền điện" shows Danh mục Điện nước and the submitted input has `category: 'utilities'`; picking Khác then typing more keeps `other`; editing an expense starts with its stored category and typing does not change it; an AI fill with description "Lẩu" shows Ăn uống; the picker's chips are a radio group and closing it returns focus to Đổi
- [X] T012 [P] [US1] Extend `frontend/src/components/ExpenseList.test.tsx` (and the table through `frontend/src/pages/ExpensesPage.test.tsx` with `onAComputer()`): each row's meta line ends with the category name

### Implementation for User Story 1

- [X] T013 [US1] Create `frontend/src/components/CategoryPicker.tsx`: a fold row "Danh mục  <name> · Đổi" (44 px button, `aria-expanded`) opening a radio group of the seven names as 44 px chips; Escape closes and focuses Đổi (as the date fold does)
- [X] T014 [US1] Wire it into `frontend/src/components/ExpenseForm.tsx` between Ngày and Cách chia: state `category` and `pickedByHand` (true when editing), follow `guessCategory(description)` while not picked by hand (including after an AI fill), send `category` in `toInput()`
- [X] T015 [US1] Show the category in each row's meta line in `frontend/src/components/ExpenseList.tsx` and `frontend/src/components/ExpenseTable.tsx`
- [X] T016 [US1] Style the picker in `frontend/src/index.css` with tokens only (chips like the payer chips, selected state not by colour alone: a check mark and bold)

**Checkpoint**: T011, T012 pass; quickstart rows 1–5.

---

## Phase 4: User Story 2 - See where the month's money went (Priority: P2)

**Goal**: "Chi theo danh mục" in the monthly report, each line a link to Chi tiêu filtered.

**Independent Test**: Quickstart rows 6–7.

### Tests for User Story 2

- [X] T017 [P] [US2] Write `frontend/src/components/CategoryChart.test.tsx`: lines in amount order with name, amount and percent as the link's text; bars `aria-hidden`; a tiny category reads "<1%"; links go to `/households/:id/expenses` with state `{ month, category }`
- [X] T018 [P] [US2] Extend `frontend/src/pages/ReportPage.test.tsx`: the chart shows under the lines for a month with expenses, its amounts add up to "Cả nhà chi", no chart for an empty month; following a line lands on Chi tiêu filtered to month and category

### Implementation for User Story 2

- [X] T019 [US2] Create `frontend/src/components/CategoryChart.tsx` per contracts/ui-contract.md (section with h3, list of links, bar width `amount / largest`, minimum 4 px)
- [X] T020 [US2] Render it in `frontend/src/pages/ReportPage.tsx` with `categoryTotals` of the month's expenses, after the lines and before the rule line, only when the month has an expense
- [X] T021 [US2] Accept `category` in the navigation state of `frontend/src/pages/ExpensesPage.tsx` (with `month`), as the starting filter, then clear the state
- [X] T022 [US2] Style `.category-chart` in `frontend/src/index.css`: bar in `--primary` on `--surface-2`, rows ≥ 44 px, name / bar / amount in a grid on a computer, stacked on a phone

**Checkpoint**: T017, T018 pass; quickstart rows 6–7.

---

## Phase 5: User Story 3 - Filter and export by category (Priority: P3)

**Goal**: A category filter in Chi tiêu and a category column in the CSV.

**Independent Test**: Quickstart rows 8–9.

### Tests for User Story 3

- [X] T023 [P] [US3] Extend `frontend/src/lib/expenseFilters.test.ts` and `frontend/src/components/ExpenseFilters.test.tsx`: `category` filters alone and with month and person; all seven are always listed; Bỏ lọc clears it
- [X] T024 [P] [US3] Extend `frontend/src/lib/csv.test.ts`: a Danh mục column after Nội dung with the names in the page's language

### Implementation for User Story 3

- [X] T025 [US3] Add `category` to `ExpenseFilter`, `NO_FILTER`, `filterExpenses` and `isFiltered` in `frontend/src/lib/expenseFilters.ts`, and the *Danh mục* select in `frontend/src/components/ExpenseFilters.tsx`
- [X] T026 [US3] Add the column in `frontend/src/lib/csv.ts`

**Checkpoint**: T023, T024 pass; quickstart rows 8–9.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T027 [P] Write `frontend/e2e/categories.spec.ts` for a local stack (`E2E_BASE_URL`, `E2E_API_URL`): own household through the API; add "Tiền điện" in the page and see Điện nước before and after saving; open the report and check the chart's amounts against "Cả nhà chi"; follow a line to the filtered list; always delete the household
- [X] T028 [P] Extend `frontend/e2e/a11y.spec.ts`: the report with the chart and Chi tiêu with the picker open, at 360 and 320 px: no sideways scroll, links and chips ≥ 44 px
- [X] T029 [P] Update `docs/ARCHITECTURE.md` §4 (the `category` column in the ER diagram and design decisions) and §5 (the expense body), `docs/DESIGN.md` §6.3 (the Danh mục row) and §6.9 (the chart), README feature table
- [X] T030 Run `ruff check .` and `pytest -q` from the root, `cd frontend && npm run lint && npm test && npm run build`, then the E2E against a fresh local Compose stack (`down -v`), never the live site
- [X] T031 Walk quickstart.md rows 1–11 on the local stack, take screenshots at 1440 and 360 px, and tick the tasks here

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (T001) → Foundational (T002–T010) → US1 → US2 → US3 → Polish.
- Backend T002 → T003 → T004 → T005 → T006 in order; frontend T007–T010 can run alongside.

### User Story Dependencies

- **US1 (P1)**: needs T005, T007, T009, T010.
- **US2 (P2)**: needs T009 (totals) and US1's data on the page; independent of US3.
- **US3 (P3)**: needs T007, T010; independent of US2.

### Within Each User Story

- Tests first and failing, then the code, then the checkpoint.

### Parallel Opportunities

- T007, T008, T010 (different files), while the backend tasks run.
- T011 and T012; T017 and T018; T023 and T024; T027, T028, T029.

## Parallel Example: User Story 1

```text
T011 ExpenseForm.test.tsx (guess, hand pick, edit, AI fill)
T012 ExpenseList.test.tsx + ExpensesPage.test.tsx (category in each row)
```

## Implementation Strategy

### MVP First (User Story 1 Only)

T001–T016: every expense has a category, guessed for free and shown in the list; reviewable on its own.

### Incremental Delivery

One PR, committed in story order (backend + foundation → US1 → US2 → US3 → polish).

### Parallel Team Strategy

One person; Minh reviews, with the backend (migration, schema, router) as the part to look at closely.

## Notes

- The AI quick add contract does not change; if a task seems to need it, stop and update plan.md first.
