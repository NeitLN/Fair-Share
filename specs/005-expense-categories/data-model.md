# Data model: Expense categories

## Table `expenses` (existing), one new column

| Column | Type | Rule |
|---|---|---|
| `category` | `text NOT NULL DEFAULT 'other'` | `CHECK (category IN ('food', 'groceries', 'utilities', 'rent', 'transport', 'household', 'other'))` |

Added by `db/migrations/005_expense_categories.sql`; every existing row becomes `'other'`. No index: it is
only read with the household's expenses, which are already fetched by `household_id`.

## Category (fixed, not stored as rows)

| Code | Vietnamese | English | Order |
|---|---|---|---|
| `food` | Ăn uống | Food & drinks | 1 |
| `groceries` | Đi chợ | Groceries | 2 |
| `utilities` | Điện nước | Utilities | 3 |
| `rent` | Tiền nhà | Rent | 4 |
| `transport` | Đi lại | Transport | 5 |
| `household` | Sinh hoạt | Household | 6 |
| `other` | Khác | Other | 7 |

## CategoryTotal (derived, `lib/categories.ts`)

| Field | Rule |
|---|---|
| `category` | a code with at least one expense in the month |
| `amount` | Σ amounts of the month's expenses with that code |
| `percent` | whole percent by largest remainder over the month's total |
| `tiny` | `amount > 0` and its exact share is under 1% |

## Invariants (each one is a test)

1. Σ `amount` over a month's totals = the month's total (`monthReport().total`).
2. Σ `percent` = 100 whenever the month has an expense.
3. Totals are ordered by amount descending, ties by the order above.
4. An expense saved without a category reads back as `other`; an unknown code is refused.
5. Balances, shares, suggested transfers and monthly report lines are the same with or without categories.
6. `guessCategory` maps each seed description to its expected code; an accent-free or upper-case
   description gives the same result.
