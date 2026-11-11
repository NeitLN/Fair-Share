# Implementation Plan: Notices tell one story

**Branch**: `spec/019-notices-one-story` (build on `feat/019-notices-one-story`, from main after #295) | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

## Summary

This plan does five things:

1. **Unmatched notices:** classify every sent notice against the current suggestions, give notices that no longer match their own lines, and make recording anything above a suggestion a two-step, server-checked action.
2. **Deletion:** a deleted repayment puts its notice money back into the pair's notice, safely under locks.
3. **Debtor block:** remove the repeats and the contradicting line.
4. **Races:** guard notice presses per pair, and turn race errors into "who did what" lines when that is provable.
5. **Telling:** offer the exact amount when a debtor tells too much.

**Server changes (`app/routers/settlements.py`):**

- **`accept_notice`:** takes the exclusive house lock and checks the suggestion. It accepts a new `warned_suggestion` and answers with two new 409 codes.
- **`delete_settlement`:** takes the exclusive house lock, locks the notice row and does one upsert for the add-back.
- **No schema change, no migration.**

**Client changes:** the rest is in `VerdictBlock`, `NoticeAmountStep`, `SettlementList`, `DashboardPage` and `usePaidTransfers`.

## Technical Context

- **Language and version:** Python 3.12 (FastAPI, Pydantic v2, psycopg3) for the backend. TypeScript 5 and React 19 for the frontend.
- **Primary dependencies:** existing ones only.
- **Storage:** PostgreSQL 16. There is no migration: `payment_notices` and `settlements.notice_amount` already exist (spec 014, migration 010).
- **Testing:**
  - **pytest on real PostgreSQL:** two-connection interleave tests, in the style of spec 014's `test_notices.py`.
  - **Vitest and Testing Library.**
  - **Playwright E2E:** `notices.spec.ts` is extended.
- **Target platform:** the web app on phones from 360 px and desktops, plus the API on Render.
- **Project type:** web application (`app/` and `frontend/`).
- **Performance goals:** none new. The accept now computes the balances under the exclusive house lock, which `send_notice` already does.
- **Constraints:**
  - Money stays exact to the đồng.
  - The house lock is taken before any row lock.
  - Spec 014's version semantics stay.
  - Spec 018's write outcomes stay.
- **Scale/Scope:**
  - 2 endpoints changed.
  - About 6 frontend files.
  - Roughly 20 new pytest cases and 15 Vitest cases.
  - 1 E2E scenario extended.

## Constitution Check

| Principle | Check | Result |
|---|---|---|
| I. Whole đồng, numbers add up | The add-back restores exactly `notice_amount`. Recording is unchanged except for the new refusals. Two-connection tests prove no told money is counted twice or lost (SC-002) | Pass |
| II. Access decided by the server | The same per-account checks: only the receiver accepts, and the owner or author deletes. The new checks are on the server (FR-006) | Pass |
| III. Schema only grows by migrations; tests on PostgreSQL | No schema change. All new server tests run on PostgreSQL | Pass |
| IV. Reviewed PR, four green checks | One PR, reviewed through the hcom loop (haru) or by Minh | Pass |
| V. No secret | None | Pass |
| VI. Vietnamese housemates on a phone | Every new line is in vi and en. The 360 px block gets shorter (US3) | Pass |
| VII. Quick add never a dependency | Not touched | Pass |

**Docs updated in the same PR (constitution governance):**

- `docs/ACCOUNTS.md` S3: add-back and the warned accept.
- `specs/014` FR-011a: a note saying it is superseded by spec 019 FR-007.
- `app/routers/households.py`: the `lock_household` docstring, since accepting now takes the exclusive lock.

## Project Structure

### Documentation (this feature)

```text
specs/019-notices-one-story/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/api.md        # accept body and refusals, delete add-back
├── contracts/ui-contract.md # lines, actions, guard, race table
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
app/
├── schemas.py                    # NoticeAccept gains warned_suggestion: int | None (>= 0)
├── errors.py (or settlements.py) # warning_required(suggestion) ApiError
└── routers/settlements.py        # accept_notice: exclusive lock + check; delete_settlement: exclusive lock + upsert
app/routers/households.py         # lock_household docstring
tests/
├── test_notices.py               # FR-006 refusals, FR-007 cases, FR-008, interleaves (replace the FR-011a test)
└── conftest.py                   # (reuse the two-connection helpers from spec 014)
frontend/src/
├── api/settlements.ts            # acceptNotice(…, warnedSuggestion?)
├── lib/notices.ts (new)          # classify(notice, suggestions) -> matched | over | unmatched; race line from before/after
├── components/VerdictBlock.tsx   # unmatched cards and lines (FR-001–004a), warning step, one Vì sao, no repeat row, muted QR line, Đang báo…
├── components/NoticeAmountStep.tsx # fill button (FR-021), over-suggestion warning hook for Nhận số khác
├── components/SettlementList.tsx # dialog wording (FR-011), hide Xoá while the card has Hoàn tác (FR-016)
├── lib/usePaidTransfers.ts       # warned accept, warning_required -> warning, per-pair guard shared with notices
├── pages/DashboardPage.tsx       # one per-pair guard (FR-019), race line (FR-020)
└── i18n/vi.tsx, en.tsx           # `notices` block of new lines
frontend/e2e/notices.spec.ts      # unmatched notice, add-back, fill button
docs/ACCOUNTS.md                  # S3
```

**Structure Decision:** web application.

- **Classification and race reasoning** live in a new pure module, `lib/notices.ts`, so they are unit-tested apart from the big `VerdictBlock`.
- **Delivery:** one PR with three commits:
  1. server: FR-006 to FR-012, with pytest;
  2. client US1 and US2;
  3. client US3 to US5, plus docs.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Exclusive house lock on accept | FR-006: a suggestion checked under a shared lock can be stale by commit; two accepts could overshoot together (review round 2) | A shared lock lets writes run side by side, so the check proves nothing |
| `warned_suggestion` in the accept body | The server must know what the person saw (FR-006) | A client-only warning: a stale card would record silently |
