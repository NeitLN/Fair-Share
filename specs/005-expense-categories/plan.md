# Implementation Plan: Expense categories and a chart per month

**Branch**: `feat/expense-categories` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-expense-categories/spec.md`

## Summary

A `category` column on `expenses` (migration 005, `NOT NULL DEFAULT 'other'`, checked against seven
codes), carried by the expense API as an optional body field and in every response. The form preselects
it from the description with a fixed word list (no accents, no case) and shows it as a fold row like
*Ngày* and *Cách chia*. The monthly report gains a "Chi theo danh mục" list of bars with every value as
text and largest-remainder percentages; Chi tiêu gains a category filter; the CSV a column. Balances,
splits, settlements and AI quick add are untouched.

## Technical Context

**Language/Version**: Python 3.12 (FastAPI, psycopg 3, Pydantic v2); TypeScript 5, React 19

**Primary Dependencies**: none new

**Storage**: PostgreSQL 16 (Supabase): one new column on `expenses` through `db/migrations/005_expense_categories.sql`

**Testing**: pytest on real PostgreSQL (migration, create/read/update with and without a category,
unknown category 422, rights unchanged); Vitest (word guess, category totals and percentages, form,
filter, CSV, chart); Playwright on a local stack (add with a guessed category, chart in the report, a11y)

**Target Platform**: Render (API, static SPA), Supabase; desktop first, phones must not break

**Project Type**: web application (API + SPA)

**Performance Goals**: none beyond today; the totals are one pass over the month's expenses

**Constraints**: schema grows only by a new migration (constitution III); old clients that send no
category keep working (default `other`); whole đồng, sums exact (I); same rights and 404 (II); 4.5:1
text, 3:1 bars and outlines, 44 px, no sideways scroll at 320/360/640 px (VI); AI contract unchanged (VII)

**Scale/Scope**: 1 migration, 2 schema fields, 2 SQL statements, seed; 1 lib module, 1 picker, 1 chart,
filter/list/table/CSV changes, ~25 strings per language; ARCHITECTURE §4–§5, DESIGN §6.3 and §6.9

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this feature meets it | Status |
|---|---|---|
| I. Money in whole đồng, every number adds up | Category totals are integer sums of the month's amounts and equal its total; percentages use largest remainder so they sum to 100; no balance input changes | Pass |
| II. Access by the server | No new route; the category rides on the existing expense routes and their checks (`app/access.py`, who may change an expense); strangers keep the 404 | Pass |
| III. Migrations, real PostgreSQL | New file `005_expense_categories.sql`, applied once at start-up; existing rows get `other` by the default; tests on real PostgreSQL; SQL stays parameterised | Pass |
| IV. Reviewed PR, four checks | One issue, one PR with this spec folder; ARCHITECTURE §4–§5 updated with the API change | Pass |
| V. No secret | Nothing secret | Pass |
| VI. Vietnamese housemates on a phone | Both languages, tokens only, values as text (colour decorates), 44 px picker and links, phone layout checked | Pass |
| VII. Quick add | The AI is not asked for a category; the draft fills the description, and the form guesses from it like a typed one | Pass |

*Re-check after Phase 1*: the contract adds one optional field with a default, so no client breaks;
still Pass.

## Project Structure

### Documentation (this feature)

```text
specs/005-expense-categories/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/api.md · contracts/ui-contract.md
├── checklists/requirements.md
└── tasks.md            # next step (/speckit-tasks)
```

### Source Code (repository root)

```text
db/migrations/005_expense_categories.sql   # new column, default, check
db/seed.sql                                 # demo expenses with their categories
app/schemas.py                              # Category literal; ExpenseIn.category = "other"; Expense.category
app/routers/expenses.py                     # SELECT / INSERT / UPDATE carry the category
tests/test_expenses.py                      # default, round trip, edit, 422, rights
tests/test_migrate.py (if it lists files)   # 005 applied on a fresh database
frontend/src/
├── api/types.ts                            # Category; Expense.category; ExpenseInput.category?
├── lib/categories.ts (+ .test.ts)          # CATEGORIES, guessCategory(), categoryTotals()
├── components/CategoryPicker.tsx           # fold row in the form: "Danh mục  Điện nước · Đổi"
├── components/ExpenseForm.tsx              # picker, guess until picked, sends category
├── components/CategoryChart.tsx (+ test)   # bars + text, links to Chi tiêu
├── components/ExpenseList.tsx, ExpenseTable.tsx   # category in each row's meta line
├── components/ExpenseFilters.tsx, lib/expenseFilters.ts   # category filter
├── lib/csv.ts                              # category column
├── pages/ReportPage.tsx                    # chart under the lines; link state { month, category }
├── pages/ExpensesPage.tsx                  # accepts { category } in navigation state
├── i18n/vi.tsx, en.tsx                     # categories, picker, chart, filter, csv
└── index.css                               # .category-* styles, tokens only
frontend/e2e/categories.spec.ts, a11y.spec.ts
docs/ARCHITECTURE.md §4–§5, docs/DESIGN.md §6.3, §6.9
```

**Structure Decision**: the existing API + SPA layout; one migration, no new route.

## Complexity Tracking

No violations to justify.
