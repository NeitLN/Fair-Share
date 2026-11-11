# Implementation Plan: No double save

**Branch**: `spec/020-no-double-save` (build on `feat/020-no-double-save`) | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

## Summary

Expenses and repayments get an optional draft identity (UUID) and a request fingerprint, stored with the record (one new migration). For a request with an identity, `create_expense` and `create_settlement` do these steps in order:

1. take the house lock;
2. take a transaction-scoped advisory lock keyed on (house, account, identity);
3. look the identity up before any other check.

The answer is the existing record (200) when the fingerprint matches, `409 draft_already_saved` when it differs, and otherwise the normal create path, which stores the identity and fingerprint.

The page keeps one identity per draft: the expense form, the hand-recorded repayment form, and each suggested-transfer card. It treats a 200 as a save, and offers "Xem" / "Ghi thành khoản mới" on `draft_already_saved`. The spec 018 lines for A1, A2 and A5 become "…bấm lại cũng không ghi trùng". "Tạo nhà" gets a synchronous guard.

The existing deadlock between two concurrent recurring-tick saves is fixed: a save that makes a recurring item takes the exclusive house lock.

## Technical Context

- **Language and version:** Python 3.12 (FastAPI, Pydantic v2, psycopg3) for the server; TypeScript 5 and React 19 for the web app.
- **Primary dependencies:** existing ones. `crypto.randomUUID()` in the browser, with a `crypto.getRandomValues()` fallback for plain HTTP (`lib/draftId.ts`); Python `hashlib` and `json` on the server.
- **Storage:** PostgreSQL 16. One migration adds nullable `draft_id uuid` and `draft_fingerprint text` to `expenses` and `settlements`, plus partial unique indexes `(household_id, created_by, draft_id) WHERE draft_id IS NOT NULL`. Its number is 013 (no spec 013 migration was on GitHub yet; spec 013 takes the next free one).
- **Testing:**
  - pytest on real PostgreSQL, with two-connection tests that use the threading pattern of `tests/test_notices.py`.
  - Vitest.
  - Playwright, with `route.fetch()` then `route.abort()` to drop the answer after the commit.
- **Target platform:** the API on Render and the web app.
- **Project type:** web application.
- **Performance goals:**
  - One extra indexed lookup per save that carries an identity.
  - The advisory lock is held only within its transaction.
- **Constraints:**
  - The house lock is always taken first.
  - A request without an identity behaves exactly as today.
  - Money stays exact to the đồng.
- **Scale/Scope:**
  - 2 create routes, 1 migration.
  - About 6 web files.
  - Around 20 new pytest cases.

## Constitution Check

| Principle | Check | Result |
|---|---|---|
| I. Whole đồng | The feature exists to stop double counting. A repeat records nothing and changes no notice | Pass |
| II. Access by the server | The identity is scoped to (house, account) after the existing access check. One account cannot read another's record through it | Pass |
| III. Schema by new migrations; tests on PostgreSQL | One new migration, numbered after agreeing with spec 013. All server tests run on PostgreSQL | Pass |
| IV. Reviewed PR, green checks | One PR through the hcom loop | Pass |
| V. No secret | None | Pass |
| VI. Phone-first, vi/en | New lines in both languages | Pass |
| VII. Quick add not a dependency | A quick-add save is a normal S1 save. A fill does not start a new draft | Pass |

**Docs:** ARCHITECTURE.md (API table: the `draft_id` field, the 200 repeat, `draft_already_saved`), docs/ACCOUNTS.md (S2 and S3 rows), and the README migration list if the repo keeps one.

## Project Structure

```text
specs/020-no-double-save/ spec.md plan.md research.md data-model.md contracts/api.md quickstart.md tasks.md
db/migrations/013_draft_ids.sql        # spec 013 takes the next free number
app/
├── services/drafts.py (new)           # fingerprint(), lock_draft(), find_draft()
├── schemas.py                         # ExpenseIn.draft_id, SettlementIn.draft_id: UUID | None
├── routers/expenses.py                # create_expense: draft path first; exclusive lock when making a recurring item
└── routers/settlements.py             # create_settlement: draft path first
tests/test_drafts.py (new)             # FR-003..FR-007, SC-001..SC-003, concurrency, recurring deadlock
frontend/src/
├── api/expenses.ts, settlements.ts    # send draft_id; repeat 200 handled like 201
├── components/ExpenseForm.tsx         # draft identity lifecycle (FR-001)
├── components/SettlementForm.tsx      # same
├── pages/ExpensesPage.tsx             # draft_already_saved: line, Xem, Ghi thành khoản mới
├── pages/DashboardPage.tsx            # same for the repayment form
├── lib/usePaidTransfers.ts            # S3: one identity per card until success / answered change
├── components/HouseholdCreateForm.tsx # synchronous guard
└── i18n/vi.tsx, en.tsx                # save.A1/A2/A5 unknown lines, draftAlreadySaved lines
frontend/e2e/safe-saves.spec.ts       # extend case 2: no duplicate after pressing again
```

**Delivery:** one PR with three commits:

1. migration + server + pytest;
2. web + Vitest;
3. E2E + docs + specs.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Fingerprint stored with the record | A pure retry must match even after the record was edited, its notice changed, or its recurring item was made (spec review, round 1) | Comparing with the current row refuses honest retries |
| Advisory lock per identity | Two requests with the same identity at once must give one record, and neither may get `month_taken` or `notice_changed` (FR-004, SC-002) | The unique index alone lets the loser fail on another index first |
