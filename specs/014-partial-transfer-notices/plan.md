# Implementation Plan: Telling the amount actually sent

**Branch**: `spec/014-partial-transfer-notices` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/014-partial-transfer-notices/spec.md`

## Summary

A transfer notice becomes "money told and not yet recorded". The server keeps a note and a version on each notice,
and remembers on each repayment how much it took from a notice. Every notice action names the version it saw;
telling and adding take the household lock that every money write now takes too, so the ceiling check cannot race an
expense or a repayment. The receiver can confirm all or part of a notice, and a repayment typed in by hand says
whether it is the told money. On the page, the debtor tells the full amount in one press or a part with a note
("Chuyển số khác"), sees "Đã báo {told}, còn thiếu {rest}" with "Báo thêm" when the debt grew, and a line explains
that the suggestion combines the house's debts. Two PRs: PR-1 makes recording safe (US3 and the versions); PR-2 adds
the debtor's side (US1, US2, US4).

## Technical Context

**Language/Version**: Python 3.12 (FastAPI, Pydantic v2, psycopg 3); TypeScript 5 with React 19

**Primary Dependencies**: FastAPI, psycopg, TanStack Query, react-router; no new dependency

**Storage**: PostgreSQL 16 (Supabase in production); one new migration `db/migrations/010_partial_notices.sql`

**Testing**: pytest on a real PostgreSQL (constitution III), Vitest + Testing Library, Playwright against the local
stack and the live site

**Target Platform**: Render (API, Docker) and Render static site; phones first (360 px), laptops

**Project Type**: web application (`app/` backend, `frontend/` SPA)

**Performance Goals**: a notice action answers within the normal API time (one row lock, one balance computation
of a house of at most 20 people)

**Constraints**: money in whole đồng ≤ 10^12 (constitution I); the server decides money and access (II); the schema
only grows (III); 44 px controls, Vietnamese and English (VI)

**Scale/Scope**: houses of up to 20 members; 6 backend endpoints changed, 1 table altered, 1 table extended; about
6 frontend files

## Constitution Check

| Principle | How this plan meets it | Status |
|---|---|---|
| I. Money is whole đồng and every number adds up | Amounts stay `StrictInt` 1..10^12; a notice never records more than was told (`notice_amount` on the repayment, the notice reduced in the same transaction); balances still come only from expenses and repayments | Pass |
| II. Access is decided by the server, per account | Only the payer tells, adds or takes back; only the receiver confirms, declines or records (rule S2); version and ceiling checked server-side under a lock | Pass |
| III. Schema grows by new migrations; tests on real PostgreSQL | `010_partial_notices.sql` adds columns and a sequence, changes no existing column's meaning; pytest runs on PostgreSQL, including concurrent cases on two connections | Pass |
| IV. Reviewed PR and four green checks | Two PRs, each reviewed by Minh | Pass |
| V. No secret in the repository | Nothing secret involved | Pass |
| VI. Vietnamese housemates on a phone | New steps fit 320 px, 44 px controls, Vietnamese first, English kept in step | Pass |
| VII. Quick add is a shortcut | Not touched | Pass |

No violation; no complexity to justify. Re-checked after Phase 1: unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/014-partial-transfer-notices/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R8
├── data-model.md        # notice, repayment, version sequence
├── quickstart.md        # how to check it
├── contracts/
│   ├── api.md           # changed endpoints
│   └── ui-contract.md   # what each screen shows
├── checklists/requirements.md
└── tasks.md             # next step (/speckit-tasks)
```

### Source Code (repository root)

```text
db/migrations/010_partial_notices.sql         # note, version, settlements.notice_amount (new)
app/schemas.py                                # NoticeIn, NoticeAdd, NoticeAccept, NoticeAnswer, Notice, SettlementIn
app/routers/settlements.py                    # tell, add, take back, accept (all or part), decline, record by hand, delete
app/routers/expenses.py                       # money writes take the household lock (shared)
app/routers/households.py                     # lock_household gains a shared mode
tests/test_notices.py                         # versions, partial, races, give-back
tests/test_settlements.py                     # hand-typed repayment as told money or not

frontend/src/api/settlements.ts, api/types.ts # new bodies and the notice's note and version
frontend/src/components/VerdictBlock.tsx      # debtor and receiver lines, "Chuyển số khác", "Báo thêm", "Nhận số khác"
frontend/src/components/NoticeAmountStep.tsx  # the shared amount + note step (new)
frontend/src/components/SettlementForm.tsx    # "Đây là tiền {payer} đã báo" / "Khoản khác"
frontend/src/components/SettlementList.tsx    # warning before deleting a repayment recorded from a notice
frontend/src/lib/usePaidTransfers.ts          # in-progress state, no early "settled"
frontend/src/lib/verdict.ts                   # told amount in the reminder message
frontend/src/i18n/vi.tsx, en.tsx              # verdict, settle, reminder groups
docs/ACCOUNTS.md (S2, S3), docs/DESIGN.md (§6.2, §7), docs/ARCHITECTURE.md (API table)
```

**Structure Decision**: the existing web layout (`app/` + `frontend/`); no new module beyond one component.

## Delivery

- **PR-1, recording is safe (US3, FR-007 to FR-011a, FR-010)**: migration, versions on every notice action, the
  household lock on money writes, "Nhận số khác", the hand-typed choice, give-back on delete, the in-progress state.
  The debtor still tells the full suggested amount as today (now with a version). Ships alone: it fixes the double
  counting that exists today.
- **PR-2, telling what was sent (US1, US2, US4, FR-001 to FR-006, FR-012, FR-013)**: "Chuyển số khác" with a note,
  the ceiling instead of the exact amount, "Báo thêm", the "còn thiếu" / "nhiều hơn" / "không còn gợi ý" lines, the
  explanation line, the reminder, the docs.

## Complexity Tracking

None.
