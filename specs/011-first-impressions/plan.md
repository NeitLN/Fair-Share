# Implementation Plan: First impressions that hold up

**Branch**: `feat/011-first-impressions` (two PRs: `feat/011-form` and `feat/011-app-shell`) | **Date**: 2026-11-08 |
**Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-first-impressions/spec.md`

## Summary

Frontend work on the expense form, quick add, the recurring list and the app shell, plus one public boolean on
`/api/version`. **PR-B (form)**: a save summary inside the sticky save area with precise focus targets and
revalidation; server errors mapped to fields; the repeat option locked whenever a new expense becomes Tự chia; an
inline confirmation above 50.000.000đ tied to the parsed amount; a one-time equal prefill for Tự chia with undo; a
"= …đ" echo on each share. **PR-D (app shell)**: a slow-request store in `request()` and a notice rendered by
`App.tsx`; quick add guarded against duplicate requests and folded when the server says AI is off; per-item stop
errors on the recurring list.

## Technical Context

**Language/Version**: TypeScript 5, React 19; Python 3.12, FastAPI (one field in `/api/version`)

**Primary Dependencies**: none new

**Storage**: none

**Testing**: Vitest + Testing Library (`renderApp`, `mockApi`, fake timers for the 5 s and 10 s rules); pytest for
`/api/version`; Playwright on the local stack for the form summary and the AI-off line

**Target Platform**: Render static site + API; phones first

**Project Type**: web application (SPA + API)

**Performance Goals**: no extra request except one `/api/version` per page load

**Constraints**: stay out of spec 012's files; no timeout or retry added; 44 px, 4.5:1, 200% zoom, reduced motion;
vi + en

**Scale/Scope**: ~8 frontend files, 3 new small libs, 1 backend file, ~20 strings per language, DESIGN.md §6.3,
§6.5, §7, ARCHITECTURE.md

## Constitution Check

| Principle | How this feature meets it | Status |
|---|---|---|
| I. Money in whole đồng | Prefill uses the existing `equalSplit` (leftover đồng to the lowest ids); the confirmation and the maximum use the parsed integer; shares still must add up | Pass |
| II. Access by the server | No access change; `/api/version` stays public and reveals only a configuration boolean | Pass |
| III. Migrations, real PostgreSQL | No schema change | Pass |
| IV. Reviewed PRs, four checks | Two PRs | Pass |
| V. No secret | The `ai` flag never contains the key | Pass |
| VI. Phones, Vietnamese | Save area and notice designed for 360 px, both languages | Pass |
| VII. Quick add is a shortcut | Fewer duplicate calls, folded when unavailable, the form always works | Pass |

Re-check after design: unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/011-first-impressions/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/api.md, contracts/ui-contract.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
PR-B (form)
  frontend/src/components/ExpenseForm.tsx      # summary, focus targets, revalidation, serverError, chooseSplit,
                                               # confirmation, prefill, share echo
  frontend/src/lib/formError.ts                # NEW: ApiError → { message, field }
  frontend/src/lib/split.ts                    # LARGE_AMOUNT, MAX_AMOUNT
  frontend/src/pages/ExpensesPage.tsx          # pass serverError (only this prop)
  frontend/src/index.css                       # .form-summary, .form-confirm, .share-preview
  frontend/src/i18n/vi.tsx, en.tsx             # form.* keys
PR-D (app shell, quick add, recurring)
  frontend/src/lib/slowRequests.ts             # NEW: store, 5 s and 10 s rules
  frontend/src/api/client.ts                   # begin/end around fetch + body read
  frontend/src/components/SlowNotice.tsx       # NEW
  frontend/src/App.tsx                         # render <SlowNotice /> before <main>
  frontend/src/lib/aiAvailability.ts           # NEW: one fetch of /api/version per page load
  frontend/src/components/AiComposer.tsx       # in-flight guard, 'off' line with kept sentence
  frontend/src/components/RecurringList.tsx    # stoppingIds, errors per item
  frontend/src/pages/ExpensesPage.tsx          # per-item stop state (only these props)
  app/routers/system.py                        # "ai" + Cache-Control: no-store
  frontend/src/index.css, i18n                 # .slow-notice, .recurring-error; ai.*, recurring.*, app.* keys
```

**Structure Decision**: new behaviour lives in small libs where it is logic (`slowRequests`, `aiAvailability`,
`formError`) and in the existing components where it is UI.

## Delivery

| PR | Stories | Notes |
|---|---|---|
| PR-B `feat/011-form` | US1, US3, US4 | All in the expense form; the biggest piece |
| PR-D `feat/011-app-shell` | US2, US5, US6 | Request layer, App shell, quick add, recurring list; one backend field |

Either can go first; both touch `ExpensesPage.tsx` in different props and `i18n` in different groups.

## Complexity Tracking

None.
