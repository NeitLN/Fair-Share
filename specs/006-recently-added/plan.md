# Implementation Plan: "Mới ghi"

**Branch**: `feat/recently-added` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-recently-added/spec.md`

## Summary

A pure function turns the expenses, settlements and members Tổng quan already loads into the list of
records other accounts saved after two per-list marks; a small component shows it at the top of the
right column (after the verdict and transfers on a phone), with "Xem thêm N" and "Đã xem tất cả". The
marks live in `localStorage` under the member and the house, written only from the data the strip was
built from. Saved times are compared at full precision through a normalised key, never through `Date`.
No API, schema or polling change.

## Technical Context

**Language/Version**: TypeScript 5, React 19

**Primary Dependencies**: TanStack Query (the existing members, expenses and settlements queries on
Tổng quan), React Router (the existing `revealExpense` hand-off and `#settlement-<id>` anchors); nothing new

**Storage**: `localStorage` only, key `fair-share:seen:<userId>:<householdId>`, value
`{"expenses": "<saved time>", "settlements": "<saved time>"}`; every read and write wrapped so a blocked
storage only loses persistence (FR-011)

**Testing**: Vitest unit tests of the pure function and the time key (every rule in data-model.md);
Testing Library tests of the strip and of Tổng quan (placement, fold, mark, reload, partial data);
Playwright on a local stack: a second account records an expense and a repayment, the first sees them,
opens one, marks all as seen; a11y walk with the strip

**Target Platform**: the web app; desktop first, phones must not break

**Project Type**: web application, SPA only

**Performance Goals**: one pass over the loaded lists per render; no request added

**Constraints**: constitution II (only through the household frame, same 404); VI (both languages,
tokens only, 4.5:1, 44 px, no sideways scroll at 320/360/640 px); no new polling (FR-012); never move a
mark from partial data (FR-007, FR-009)

**Scale/Scope**: 1 pure module, 1 component, Tổng quan wiring, ~15 strings per language, styles,
DESIGN.md §6.2 note

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this feature meets it | Status |
|---|---|---|
| I. Money in whole đồng | Amounts are shown, never computed; no balance input changes | Pass |
| II. Access by the server | Reads only what Tổng quan already fetched through routes that 404 strangers and people waiting | Pass |
| III. Migrations, real PostgreSQL | No backend change | Pass (n/a) |
| IV. Reviewed PR, four checks | One issue, one PR with this spec folder; unit, page and E2E tests | Pass |
| V. No secret | The browser stores two timestamps per house, nothing secret | Pass |
| VI. Vietnamese housemates on a phone | Both languages, neutral surface with tokens, polite live region, 44 px, placement after the money actions on a phone | Pass |
| VII. Quick add | Untouched | Pass (n/a) |

*Re-check after Phase 1*: no request, no stored server data, no polling; still Pass.

## Project Structure

### Documentation (this feature)

```text
specs/006-recently-added/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/ui-contract.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
frontend/src/
├── lib/recent.ts (+ .test.ts)        # savedKey(), recentItems(), readMarks(), writeMarks()
├── components/RecentStrip.tsx (+ test)
├── pages/DashboardPage.tsx           # builds the items, places the strip at the top of split-rest
├── pages/DashboardPage.test.tsx      # placement, partial data, mark survives a remount
├── i18n/vi.tsx, i18n/en.tsx          # recent block
└── index.css                         # .recent-strip, tokens only
frontend/e2e/recent.spec.ts, a11y.spec.ts
docs/DESIGN.md §6.2
```

**Structure Decision**: SPA only, the same pattern as `lib/explain.ts` and `lib/monthReport.ts`.

## Complexity Tracking

No violations to justify.
