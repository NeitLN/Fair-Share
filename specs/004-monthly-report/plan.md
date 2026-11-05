# Implementation Plan: Monthly report

**Branch**: `feat/monthly-report` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-monthly-report/spec.md`

## Summary

A read-only page per month, inside the household frame, at `/households/{id}/report/{YYYY-MM}`. A pure
function builds the report from the expenses (with their shares) and the confirmed repayments the app
already loads: for each housemate the balance before the month, the month's paid, share, paid back and
got back, and the balance after it. The last month's end is checked against the balances the API
returns, the same guard "Vì sao ra số này?" uses, so the report never shows a number that disagrees with
Tổng quan. It opens from the "Tháng …" block on Tổng quan, steps month by month, and links to Chi tiêu
filtered to the same month. No API, schema or permission change.

## Technical Context

**Language/Version**: TypeScript 5, React 19

**Primary Dependencies**: React Router (a new child route), TanStack Query (the existing expenses,
settlements, members and balances queries, served from the cache); nothing new

**Storage**: N/A (derived on each render, never stored)

**Testing**: Vitest unit tests of the pure function (every invariant in data-model.md), Testing Library
tests of the page and the entry link; Playwright on a local stack: a report walk and the a11y walk
extended to the report page

**Target Platform**: the web app; desktop first, phones must stay readable

**Project Type**: web application, SPA only

**Performance Goals**: a house's whole history (hundreds of items) is computed in one pass on the client,
well under a frame; no extra request beyond what Tổng quan already makes

**Constraints**: whole đồng and exact sums (constitution I); access only through the household frame,
which already turns a stranger or someone waiting into 404 (II); 4.5:1, 44 px, no sideways scroll at
320/360/640 px and 200% zoom (VI); Vietnamese and English

**Scale/Scope**: 1 pure module, 1 page, 1 route, 1 link on Tổng quan, a month hand-off into Chi tiêu's
filter, ~20 strings per language, styles, DESIGN.md §6 note

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this feature meets it | Status |
|---|---|---|
| I. Money in whole đồng, every number adds up | Integer sums only; every line balances by construction; the last month's ends are compared with the API's nets and the report waits ("Đang cập nhật…") while they differ (R2); only confirmed settlements count (S3) | Pass |
| II. Access by the server | The page reads only through existing routes that already return 404 to strangers and people waiting; it lives under the household frame that shows the not-found page | Pass |
| III. Migrations, real PostgreSQL | No backend change | Pass (n/a) |
| IV. Reviewed PR, four checks | One issue, one PR with this spec folder; unit, page and E2E tests added | Pass |
| V. No secret | Nothing secret | Pass |
| VI. Vietnamese housemates on a phone | Both languages, tokens only, money colours as elsewhere, phone layout stacks; a11y walk covers the page | Pass |
| VII. Quick add | Untouched | Pass (n/a) |

*Re-check after Phase 1*: the design adds no request, no write and no stored figure; still Pass.

## Project Structure

### Documentation (this feature)

```text
specs/004-monthly-report/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/ui-contract.md
├── checklists/requirements.md
└── tasks.md            # next step (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── lib/monthReport.ts            # new: monthRange(), monthReport(), shiftMonth(); pure
├── lib/monthReport.test.ts       # new: the invariants of data-model.md
├── pages/ReportPage.tsx          # new: month heading, prev/next, total, table (wide) or cards (phone)
├── pages/ReportPage.test.tsx     # new
├── App.tsx                       # route households/:id/report/:month?
├── components/MonthTotals.tsx    # optional "Báo cáo tháng" link (used on Tổng quan)
├── pages/DashboardPage.tsx       # passes the link target
├── pages/ExpensesPage.tsx        # accepts { month } in navigation state as the starting filter
├── i18n/vi.tsx, i18n/en.tsx      # report block
└── index.css                     # .report-* styles, tokens only
frontend/e2e/report.spec.ts       # new: walk on a local stack
frontend/e2e/a11y.spec.ts         # report page added to the walk
docs/DESIGN.md §6                 # the report screen
```

**Structure Decision**: SPA only, following the pattern of `lib/explain.ts` (pure function plus a
component fed by the cached queries). No backend file changes.

## Complexity Tracking

No violations to justify.
