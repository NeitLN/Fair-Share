# Implementation Plan: Recurring expenses

**Branch**: `feat/recurring-expenses` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-recurring-expenses/spec.md`

## Summary

Migration 006 adds a `recurring_items` table (equal split only: payer, member ids, optional amount, day,
active flag) and a nullable `expenses.recurring_item_id` with a unique index on (item, first day of the
month of `spent_at`). The expense routes take two optional body fields: `recurring` (make this new
expense recur) and `recurring_item_id` (record it from a due item); both are checked in the same
transaction as the expense, and a unique violation becomes `409 recurring_month_taken`. Two small routes
list the house's active items and stop one. The SPA works out what is due from the items and the
expenses it already loads, shows a "Tới hạn" card under the transfers, fills the add form from an item,
and lists the items in Chi tiêu.

## Technical Context

**Language/Version**: Python 3.12 (FastAPI, psycopg 3, Pydantic v2); TypeScript 5, React 19

**Primary Dependencies**: none new

**Storage**: PostgreSQL 16 (Supabase): `db/migrations/006_recurring_expenses.sql` (new table, new column,
partial unique expression index, RLS enabled)

**Testing**: pytest on real PostgreSQL (create with the tick, varying amount, custom split refused,
20-item limit, recording from an item, duplicate month by insert and by date edit, edit keeps the link,
delete frees the month, stopped item refused, rights, other house, house deletion, balances unchanged,
the index itself with two connections); Vitest (due rule, month clamping, form tick and prefill, card,
list, 409 handling); Playwright on a local stack (tick → due next month is not testable in one day, so
an item is created through the API with today's day; "Ghi luôn" → Lưu → card gone; second save
refused)

**Target Platform**: Render (API, static SPA), Supabase; desktop first, phones must not break

**Project Type**: web application (API + SPA)

**Performance Goals**: none beyond today; at most 20 active items per house

**Constraints**: constitution III (new migration only, real PostgreSQL); I (whole đồng, equal split by
the existing rule); II (same access, same 404, creator-or-owner to stop); old clients keep working (new
fields optional, PUT keeps the link); no scheduler (FR-016)

**Scale/Scope**: 1 migration, 1 new router (2 routes), expense router changes, schemas; 1 lib module, 1
API module, form changes, 1 card, 1 list, ~30 strings per language; ARCHITECTURE §4–§5, PROJECT_SPEC
§3.3, DESIGN §6.2–§6.3

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this feature meets it | Status |
|---|---|---|
| I. Money in whole đồng | Amounts are bigint; an item's split is equal, so shares come from `equal_split()` like any expense; items change no balance until an expense is saved | Pass |
| II. Access by the server | The new routes use `HouseholdAccess`; `/recurring/{id}` resolves its household like `/expenses/{id}`; stopping uses `require_owner_or_author`; an item from another house is refused | Pass |
| III. Migrations, real PostgreSQL | New file 006; existing rows get `recurring_item_id NULL`; the rule "one per item and month" is a database index; RLS enabled; tests on PostgreSQL with two connections for the index | Pass |
| IV. Reviewed PR, four checks | One issue, one PR; ARCHITECTURE and PROJECT_SPEC updated in it | Pass |
| V. No secret | Nothing secret | Pass |
| VI. Vietnamese housemates | Both languages, tokens only, 44 px, card under the transfers on a phone, a11y walk extended | Pass |
| VII. Quick add | The AI contract does not change; a form filled by AI is a normal add form | Pass |

*Re-check after Phase 1*: the scope extension is written into PROJECT_SPEC §3.3 in the same PR; still Pass.

## Project Structure

### Documentation (this feature)

```text
specs/007-recurring-expenses/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/api.md · contracts/ui-contract.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
db/migrations/006_recurring_expenses.sql
app/schemas.py                    # RecurringIn on ExpenseIn, recurring_item_id, RecurringItem
app/routers/expenses.py           # create/update read and write the link; 409 on the index
app/routers/recurring.py          # GET /households/{id}/recurring, POST /recurring/{id}/stop
app/access.py                     # /recurring/{id} resolves its household
app/routers/households.py         # house deletion also clears recurring_items
app/main.py                       # include the router
tests/test_recurring.py
frontend/src/api/types.ts, api/recurring.ts
frontend/src/lib/recurring.ts (+ .test.ts)          # dueItems(), dueDay(), monthState()
frontend/src/components/ExpenseForm.tsx (+ test)    # tick, varying, filled from an item, period line
frontend/src/components/DueCard.tsx (+ test)        # "Tới hạn" under the transfers
frontend/src/components/RecurringList.tsx (+ test)  # "Khoản định kỳ (n)" in Chi tiêu, Ngừng lặp
frontend/src/pages/DashboardPage.tsx, ExpensesPage.tsx (+ tests)
frontend/src/i18n/vi.tsx, en.tsx; index.css
frontend/e2e/recurring.spec.ts, a11y.spec.ts
docs/ARCHITECTURE.md §4–§5, docs/PROJECT_SPEC.md §3.3, docs/DESIGN.md §6.2–§6.3
```

**Structure Decision**: existing API + SPA layout; one migration, one small router.

## Complexity Tracking

No violations to justify.
