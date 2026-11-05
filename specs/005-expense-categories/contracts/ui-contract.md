# UI contract: categories in the SPA

## `lib/categories.ts`

```ts
type Category = 'food' | 'groceries' | 'utilities' | 'rent' | 'transport' | 'household' | 'other'
const CATEGORIES: Category[]   // in the order of FR-001

function guessCategory(description: string): Category
interface CategoryTotal { category: Category; amount: number; percent: number; tiny: boolean }
function categoryTotals(expenses: Expense[]): CategoryTotal[]   // the expenses of one month
```

Pure. Invariants: [data-model.md](../data-model.md#invariants-each-one-is-a-test).

## Form (`components/ExpenseForm.tsx` + `CategoryPicker.tsx`)

A fold row between *Ngày* and *Cách chia*: "Danh mục  Điện nước · Đổi". *Đổi* (44 px) opens a radio group
of seven chips (44 px each, wrapping); picking one closes the fold and sets "picked by hand". While not
picked by hand the row follows `guessCategory(description)`. Editing starts picked by hand with the stored
category. An AI fill sets the description, so the guess follows it. `toInput()` sends `category`.

## Lists

- `ExpenseList` (phone) and `ExpenseTable` (computer): the meta line ends with " · <category name>".
- `ExpenseFilters`: a *Danh mục* select after *Người* with *Tất cả* and the seven names; `ExpenseFilter`
  gains `category: Category | null`; `filterExpenses` and `isFiltered` take it into account.
- `ExpensesPage` reads `location.state.category` (with `month`) as the starting filter, then clears it.

## Chart (`components/CategoryChart.tsx`, in `ReportPage`)

Shown when the month has at least one expense, after the housemates' lines and their rule line, before *Xem các khoản chi tháng này*.

```
Chi theo danh mục
Tiền nhà     ████████████████████  4.500.000đ · 58%
Đi chợ       ██████                1.200.000đ · 15%
…
```

`<section aria-labelledby>` with an `<h3>`, then `<ul>`; each `<li>` holds a `Link` to Chi tiêu with state
`{ month, category }` whose text is "<name> <amount> · <percent>" (accessible name), and a bar
`<span aria-hidden="true">` sized to `amount / largest`. Rows ≥ 44 px.

## CSV

A column *Danh mục* / *Category* after *Nội dung*, with the name in the page's language.

## Strings (vi / en)

`categories.{food,…,other}`, `categories.label` (Danh mục), `categories.change` (Đổi),
`categories.chartTitle` (Chi theo danh mục), `categories.share(percent)`, `categories.tiny` (<1%),
`filters.category`, `csv.category`.
