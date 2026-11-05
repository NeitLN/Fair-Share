# UI contract: Monthly report

The feature exposes no API. Its contract is between the pure functions, the page and the places that
open it.

## `lib/monthReport.ts`

```ts
type Month = string // "YYYY-MM"

interface MonthRange { first: Month; last: Month }
interface ReportLine { memberId: number; start: number; paid: number; share: number; paidBack: number; gotBack: number; end: number }
interface MonthReport { month: Month; total: number; lines: ReportLine[]; empty: boolean; laterItems: boolean }

function monthRange(expenses: Expense[], settlements: Settlement[], current: Month): MonthRange
function clampMonth(wanted: string | undefined, range: MonthRange, current: Month): Month   // R3
function shiftMonth(month: Month, by: number): Month
function monthReport(month: Month, expenses: Expense[], settlements: Settlement[], members: Member[], current: Month): MonthReport
function inStep(report: MonthReport, balances: MemberBalance[]): boolean   // R2, for the last month
```

Pure, no React, no I/O. Invariants: [data-model.md](../data-model.md#invariants-each-one-is-a-unit-test).

## Route

`/households/:householdId/report/:month?`, a child of `HouseholdLayout` (so a stranger or someone
waiting sees the not-found page, as on every other tab). Tổng quan's tab stays active.

| Address | Result |
|---|---|
| `…/report` | replaced by `…/report/<current month>` |
| `…/report/2026-11` in range | that month |
| `…/report/1999-01`, `…/report/2026-13`, `…/report/abc` | replaced by the nearest month in range (R3) |

## `pages/ReportPage.tsx`

Reads the cached members, expenses, settlements and balances queries (same keys as Tổng quan).

| State | Shows |
|---|---|
| Any query loading | heading with the month, a skeleton of the lines |
| Any query failed | the error note with Thử lại; no figures |
| Loaded, the month is `last` and not in step | "Đang cập nhật…", refetch; no figures |
| Loaded | heading "Báo cáo tháng 11/2026", "Cả nhà chi X", the lines (table ≥ 1024 px, cards below), "Xem các khoản chi tháng này" |
| `empty` | "Tháng này không có khoản chi hay khoản trả nào" above the lines |
| `laterItems` | one line: "Có khoản ghi ngày sau tháng này, nên cuối tháng chưa bằng số trên Tổng quan" |

Previous / next: links labelled with the target month (`aria-label` "Tháng trước: Tháng 10/2026"), at
least 44 × 44 px, not rendered at the ends of the range. The signed-in member's line has the "Bạn" chip.

## Entry and exit

- `components/MonthTotals.tsx` takes an optional `reportTo` path; when given it renders a
  "Báo cáo tháng" link under the heading. Only Tổng quan passes it (current month).
- "Xem các khoản chi tháng này" links to `/households/:id/expenses` with navigation state
  `{ month: "YYYY-MM" }`; `ExpensesPage` starts its filter on that month (if it has expenses) and clears
  the state, as it does for `revealExpense`.

## Strings (vi / en)

`report.title(month)`, `report.open`, `report.previous(month)`, `report.next(month)`, `report.total`,
`report.columns.{who,start,paid,share,paidBack,gotBack,end}`, `report.totalRow`, `report.empty`,
`report.laterItems`, `report.updating`, `report.loading`, `report.seeExpenses`.
