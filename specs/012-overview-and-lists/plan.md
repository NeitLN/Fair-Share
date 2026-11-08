# Implementation Plan: Overview and lists that read right

**Branch**: one per PR: `feat/012-overview` (PR-A), `feat/012-language-copy` (PR-E), `feat/012-lists-houses`
(PR-L) | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md) | **Built by**: Duy Anh, reviewed by Tiến or Minh

**Input**: Feature specification from `/specs/012-overview-and-lists/spec.md`

## Summary

Three PRs of mostly frontend work. **PR-A (Tổng quan)**: the coloured block stops overlapping its avatars below
380 px and shows big amounts in full; the person who owes gets a primary "Tôi đã chuyển" action right under the
block, reusing today's notice handlers; a house with one person shows the invite card instead of empty money
sections. **PR-E (language and copy)**: Vietnamese becomes the default unless the browser is English, and a set of
messages say exactly what happens (the gender notice gets shorter and a new notice version). **PR-L (lists and
houses)**: long descriptions are clamped to two lines with "Xem đủ"; a month filter stays on an empty month; the
list of houses gains each house's balance and a waiting badge from one extended query.

## Technical Context

**Language/Version**: TypeScript 5, React 19 (SPA); Python 3.12, FastAPI (one query change in PR-L, the notice
constant in PR-E)

**Primary Dependencies**: none new

**Storage**: none new; `GET /api/households` computes two more fields (see [data-model.md](data-model.md))

**Testing**: Vitest + Testing Library (`renderApp`, `mockApi` in `frontend/src/test/renderApp.tsx`); pytest on real
PostgreSQL for PR-L and PR-E; Playwright on the local stack (`frontend/e2e`)

**Target Platform**: Render static site + API; phones first (320–390 px), laptops 1024–1440 px

**Project Type**: web application (SPA + API)

**Performance Goals**: Nhà của bạn stays one request (SC-004)

**Constraints**: do not touch the expense form, AI quick add, `api/client.ts` (spec 011); 44 px targets, 4.5:1
contrast, no sideways scroll (DESIGN.md §8); vi + en for every string

**Scale/Scope**: about 12 frontend files, 2 backend files, ~25 strings per language, DESIGN.md §6.1–6.3 and §7

## Constitution Check

| Principle | How this feature meets it | Status |
|---|---|---|
| I. Money in whole đồng | `my_net` uses the same integer sums as the balances route; no new money rule; the debtor's buttons follow the existing suggestions | Pass |
| II. Access by the server | The list stays the caller's own houses; `waiting` counts only what the caller can act on | Pass |
| III. Migrations, real PostgreSQL | No migration; the query change is tested on PostgreSQL | Pass |
| IV. Reviewed PRs, four checks | Three PRs, each reviewed | Pass |
| V. No secret | None | Pass |
| VI. Phones, Vietnamese | The point of the feature: 320–390 px fixes, Vietnamese default, 44 px, both languages | Pass |
| VII. Quick add | Untouched | Pass |

Re-check after design: unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/012-overview-and-lists/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/api.md, contracts/ui-contract.md
├── checklists/requirements.md
└── tasks.md            # the list Duy Anh works through
```

### Source Code

```text
PR-A  frontend/src/components/VerdictBlock.tsx      # avatars row below 380 px, DebtorAction, no duplicate button
      frontend/src/pages/DashboardPage.tsx          # alone → <InviteCard> (components/InviteCard.tsx, reused as is)
      frontend/src/index.css                        # .verdict-people, .verdict-total below 380 px, .debtor-action
PR-E  frontend/src/i18n/language.ts                 # default language
      frontend/src/i18n/vi.tsx, en.tsx              # copy pass (US7), new keys for PR-A/PR-L strings
      frontend/src/pages/AuthPage.tsx               # empty-name message, hint hidden while error shows
      frontend/src/components/HouseholdCreateForm.tsx # empty house name message
      frontend/src/pages/AccountPage.tsx            # empty profile name message only
      frontend/src/api/households.ts, app/schemas.py # GENDER_NOTICE 2026-11-v2
      frontend/e2e/english.spec.ts                  # browser-locale cases
PR-L  app/routers/households.py, app/schemas.py     # my_net, waiting in GET /api/households
      frontend/src/api/types.ts                     # MyHousehold fields
      frontend/src/components/HouseholdList.tsx     # balance line, badge, chip gap
      frontend/src/index.css                        # .household-list grid ≥1024 px, clamp rules
      frontend/src/components/ExpenseList.tsx, ExpenseTable.tsx  # clamp + "Xem đủ"
      frontend/src/pages/ExpensesPage.tsx, components/ExpenseFilters.tsx  # keep empty month filter
```

**Structure Decision**: the existing components already own each piece; no new page, one small new component
(`DebtorAction`, inside `VerdictBlock.tsx` or beside it).

## Delivery

| PR | Stories | Order | Notes |
|---|---|---|---|
| PR-A | US1, US2, US3 | 1st | Pure frontend; add its strings in new keys (`verdict.debtor*`, `dashboard.invite*`) |
| PR-E | US6, US7 | 2nd (or in parallel with PR-A) | Touches many tests because of the default language; keep it its own PR |
| PR-L | US4, US5 | 3rd | The only backend change; ruff + pytest |

Each PR: issue first, branch from `main`, tests green (`ruff`, pytest, lint, Vitest, build, local E2E), screenshots
at 360 px and 1440 px in the PR description, DESIGN.md updated for the screens it changes.

## Complexity Tracking

None.
