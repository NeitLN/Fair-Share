# Implementation Plan: House list and profile redesign

**Branch**: `spec/017-houses-profile-redesign` | **Date**: 11/11/2026 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/017-houses-profile-redesign/spec.md`

## Summary

Front-end only. `/` shows the houses as rows in one panel with the money words and amounts on one right edge, a *Thêm nhà* panel (two folds whose titles stay visible) beside the list from 1280 px and under it below, and no help paragraphs for returning users. `/account` gets a back link, a left card *Bạn cùng nhà thấy bạn thế này* (photo, name, status, receiving hint, email) and one panel of parts on the right from 1024 px, distinct save names, a *Chưa lưu* mark and focus that never falls to the page body. The account button shows the user's own avatar. Four PRs: tests by region first, then `/`, then `/account`, then the header. Decisions and their reasons: [research.md](research.md); what the tests may rely on: [contracts/ui-contract.md](contracts/ui-contract.md).

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, CSS with the tokens of `frontend/src/styles/tokens.css`

**Primary Dependencies**: Vite, React Router, TanStack Query (all present); no new package

**Storage**: N/A (no data change; no migration)

**Testing**: Vitest + Testing Library (`frontend/src/**/*.test.tsx`), Playwright E2E (`frontend/e2e/`, the smoke subset runs against live after every deploy), oxlint, `tsc -b`

**Target Platform**: the web app on a phone (320 to 430 px) and a computer (1024 to 2560 px; signed-in pages are zoomed 110% from 1024 px, so a 1280 px screen lays out like 1164 px minus gutters ≈ 1098 px)

**Project Type**: web application (FastAPI API + React SPA); only `frontend/` and `docs/DESIGN.md` change

**Performance Goals**: no new request on `/`; on any page one cached `GET /api/me/photo` per session for the header avatar (an existing endpoint, already loaded by the profile)

**Constraints**: DESIGN.md five rules (one loud place, hard shadow only on a form's main action, money never by colour alone, tokens only, 44 px targets); DOM order equals visual order; no sticky element; no new token; existing region names and the fold `<details>` kept (contracts)

**Scale/Scope**: 2 pages, 1 header component, about 8 source files, 6 test files, 4 sections of DESIGN.md

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Money in whole đồng | Amounts still come from the API and go through `Money`; no arithmetic added (no cross-house total, FR-005) | Pass |
| II. Access by the server | No endpoint, no rule change; the receiving account on the card is the person's own, already loaded on that page | Pass |
| III. Migrations, real PostgreSQL | No schema change | Pass (N/A) |
| IV. Reviewed PRs, four checks | Four PRs, each reviewed (Minh; Duy Anh for PR 1), PR 0 merged first so the live smoke never breaks | Pass |
| V. No secrets | Nothing secret touched | Pass |
| VI. Vietnamese housemates on a phone | Vietnamese copy first with English twins; tokens only; 44 px; 320 px and 200% zoom checked; money keeps words, not colour alone | Pass |
| VII. Quick add | Not touched | Pass (N/A) |
| Governance (doc and code agree) | DESIGN.md §6.1, §6.6, §6.8, §6.10 and the header part of §5 change in the PR that changes the page | Pass |

Re-check after Phase 1: unchanged, all pass. No violation, so no Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/017-houses-profile-redesign/
├── spec.md
├── plan.md               # this file
├── research.md           # R1 to R10: layout, rows, folds, profile, saving, focus, titles, avatar, tests
├── data-model.md         # no new data; the page state each part keeps
├── quickstart.md         # how to check it by hand and with the tests
├── contracts/
│   └── ui-contract.md    # landmarks, headings, names and classes the tests and E2E rely on
├── checklists/
│   └── requirements.md
└── tasks.md              # /speckit-tasks
```

### Source Code (repository root)

```text
frontend/src/
├── pages/
│   ├── HouseholdsPage.tsx        # PR 1: Thêm nhà panel, no hints with a house, /join focus, page title
│   ├── HouseholdsPage.test.tsx   # PR 1
│   ├── AccountPage.tsx           # PR 2: back link, identity card, parts panel, save names, Chưa lưu, focus
│   └── AccountPage.test.tsx      # PR 0 (queries by region), PR 2
├── components/
│   ├── HouseholdList.tsx         # PR 1: rows (tile, head, money words + amount); Duy Anh reviews
│   ├── JoinForm.tsx              # PR 1: error ids, live area always present, field ref for focus
│   ├── HouseholdCreateForm.tsx   # PR 1: error ids, invite hint inside
│   ├── ReceivingAccountForm.tsx  # PR 2: facts as a dl, Lưu tài khoản, focus after each swap
│   └── AccountMenu.tsx           # PR 2: aria-current + focus the title; PR 3: real avatar
├── lib/
│   └── usePageTitle.ts           # PR 1 (new): "<page> · Fair-Share", restored on leave
├── i18n/vi.tsx, i18n/en.tsx      # PR 1, PR 2: new keys (research R9)
└── index.css                     # PR 1: rows, ways-in panel; PR 2: profile grid, parts, chips, facts; PR 3: header avatar
frontend/e2e/
├── profile.spec.ts               # PR 0 (by region), PR 2 (photo region)
├── lists.spec.ts                 # PR 1: one right edge instead of ≥ 2 grid tracks
└── a11y.spec.ts                  # PR 1, PR 2: locators by role and name; new width and focus checks
docs/DESIGN.md                    # PR 1: §6.1, §6.6, §6.8; PR 2: §6.10; PR 3: §5 header
```

**Structure Decision**: the existing web-app layout; every change is in `frontend/` and `docs/DESIGN.md`. No API, migration or new package.

## Delivery

| PR | Branch | Content | Reviewers | Merge gate |
|---|---|---|---|---|
| PR 0 | `test/017-profile-saves-by-region` | Profile unit and E2E tests find each save inside its region with `/^Lưu/` (works before and after the renames) | Minh | Must merge before PR 2; live smoke green |
| PR 1 | `feat/017-house-rows` | US1, US2 on `/`, `usePageTitle`, DESIGN §6.1, §6.6, §6.8 | Duy Anh, Minh | Live smoke green |
| PR 2 | `feat/017-profile-layout` | US3, US4 on `/account`, menu link current + focus, DESIGN §6.10 | Minh | After PR 0; live smoke green |
| PR 3 | `feat/017-header-avatar` | US5 avatar in the account button, DESIGN §5 | Minh | Live smoke green |

## Complexity Tracking

None.
