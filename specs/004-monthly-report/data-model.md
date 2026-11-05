# Data model: Monthly report

Nothing is stored and no table changes. These are the derived shapes `lib/monthReport.ts` returns.

## Month

`"YYYY-MM"`, e.g. `"2026-11"`. An expense belongs to `spent_at.slice(0, 7)`, a settlement to
`settled_at.slice(0, 7)` (FR-005). Months compare as strings.

## MonthRange

| Field | Meaning |
|---|---|
| `first` | earliest month of any expense or settlement; the current month when there is none |
| `last` | the later of the current month and the latest month of any expense or settlement |

## ReportLine (one housemate, one month)

| Field | Rule |
|---|---|
| `memberId` | today's members in their order, then anyone who left but appears in an item, by id |
| `start` | Σ over items dated before the month of (paid − share + sent − received) |
| `paid` | Σ amounts of expenses in the month this member paid |
| `share` | Σ this member's shares of expenses in the month |
| `paidBack` | Σ settlements in the month sent by this member |
| `gotBack` | Σ settlements in the month received by this member |
| `end` | `start + paid − share + paidBack − gotBack` |

## MonthReport

| Field | Meaning |
|---|---|
| `month` | the month shown |
| `total` | Σ amounts of expenses in the month |
| `lines` | one `ReportLine` per housemate |
| `empty` | true when the month has no expense and no settlement |
| `laterItems` | true when something is dated after this month and this month is the current one |

## Invariants (each one is a unit test)

1. Every figure is an integer.
2. For each line, `start + paid − share + paidBack − gotBack === end`.
3. Σ `start` = 0 and Σ `end` = 0.
4. Σ `paid` = Σ `share` = `total`; Σ `paidBack` = Σ `gotBack`.
5. For consecutive months A, B in range, each member's `end` in A equals their `start` in B.
6. In `first`, every `start` is 0.
7. In `last`, each member's `end` equals their `net` from the balances API (checked at run time, R2).
8. An `empty` month has every movement 0 and `start === end`.
9. Notices never change any figure (the function does not take them).
