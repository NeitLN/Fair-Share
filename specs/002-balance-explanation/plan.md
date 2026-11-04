# Implementation Plan: Why this number? (balance explanation)

**Branch**: `feat/balance-explanation` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-balance-explanation/spec.md`

## Summary

On Tổng quan, any member can open the explanation of a balance (their own from the verdict, anyone's
from Số dư từng người): four lines that add up to the balance (spent, share, repayments made,
repayments received), and under each line the expenses or repayments behind it. Everything it needs is
already loaded by the page (balances with their four totals, every expense with its shares, every
repayment, the "Tôi đã chuyển" notices), so this is a frontend feature: one pure function that builds
the explanation, one component that shows it in place, two entry points, and links to where an item can
be changed. No API, schema or access change.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19

**Primary Dependencies**: Vite, TanStack Query (the page's existing queries), React Router (links and
navigation state). No new dependency.

**Storage**: None new. Reads the queries the page already has: balances, expenses (with shares),
settlements, notices.

**Testing**: Vitest + Testing Library (unit tests for the pure function, page tests with the mocked
API as in `DashboardPage.test.tsx`); the existing Playwright a11y walk for contrast, 44 px and sideways
scroll.

**Target Platform**: The web app on Render's static site; desktop first, phone must not break.

**Project Type**: Web application (React SPA + FastAPI); this feature touches the SPA only.

**Performance Goals**: The four lines appear at once when opened (no request); building the item lists
for a few hundred expenses is a single pass, well under a frame.

**Constraints**: Integer đồng only; lines add up exactly to the balance; Vietnamese and English;
contrast ≥ 4.5:1 in both themes; controls ≥ 44 px; no sideways scroll at 320/360 px.

**Scale/Scope**: Households of 2–8 people, up to a few hundred expenses; one new component, one new
library module, changes to the verdict block, the balance rows and the Chi tiêu page (to reveal an
expense it is sent to).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this feature meets it | Status |
|---|---|---|
| I. Money is whole đồng and every number adds up | Lines are the API's integer totals; items are integer amounts and shares; a check that items add up to their line is part of the design (research R2) | Pass |
| II. Access is decided by the server, per account | No new endpoint; the data comes from requests already limited to members (404 for strangers and people waiting) | Pass |
| III. Schema only grows by new migrations; tests on real PostgreSQL | No schema or backend change, so no migration and no new backend test | Pass (n/a) |
| IV. Reviewed PR and four green checks | One issue, one PR, frontend tests added, CI as usual | Pass |
| V. No secret in the repository | Nothing secret involved | Pass |
| VI. Made for Vietnamese housemates on a phone | Copy in `vi.tsx` and `en.tsx`; tokens only; 44 px; sign and words with every amount; checked at 320/360 px | Pass |
| VII. Quick add is a shortcut | Not involved; an expense saved from Quick add is explained like any other | Pass (n/a) |

No violations, so Complexity Tracking stays empty.

*Re-check after Phase 1*: the design adds no request, no stored data and no new rights; it still
passes every row above.

## Project Structure

### Documentation (this feature)

```text
specs/002-balance-explanation/
├── plan.md              # This file
├── research.md          # Phase 0: decisions and why
├── data-model.md        # Phase 1: the derived explanation and its invariants
├── quickstart.md        # Phase 1: how to check it works end to end
├── contracts/
│   └── ui-contract.md   # Phase 1: the pure function, the component, entry points, copy keys
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── lib/
│   ├── explain.ts              # NEW: explain(member, balance, expenses, settlements) → lines + items
│   └── explain.test.ts         # NEW: sums, signs, zero lines, removed members, stale data
├── components/
│   ├── BalanceExplanation.tsx  # NEW: the four lines, their items, links to change an item
│   ├── BalanceExplanation.test.tsx
│   ├── VerdictBlock.tsx        # "Vì sao ra số này?" next to the amount (own balance)
│   ├── BalanceRows.tsx         # each row opens that person's explanation
│   ├── ExpenseList.tsx         # a row can be revealed and scrolled to
│   ├── ExpenseTable.tsx        # same, on a computer
│   └── SettlementList.tsx      # rows get an id to scroll to
├── pages/
│   ├── DashboardPage.tsx       # passes expenses, settlements, notices to the explanation
│   ├── DashboardPage.test.tsx  # entry points, wording, refresh keeps sums
│   └── ExpensesPage.tsx        # reveals the expense named in the navigation state
├── i18n/vi.tsx, i18n/en.tsx    # new copy (contracts/ui-contract.md)
└── index.css                   # .explain styles on tokens

docs/DESIGN.md                  # §6.2: the explanation on Tổng quan
frontend/e2e/a11y.spec.ts       # opens an explanation in the existing accessibility walk
```

**Structure Decision**: Web application, SPA only. The logic is a pure function in `lib/` like
`lib/verdict.ts` and `lib/expenseFilters.ts`, unit-tested without React; the component only renders
what it returns, as the other components do ("Props only").

## Complexity Tracking

No violations to justify.
