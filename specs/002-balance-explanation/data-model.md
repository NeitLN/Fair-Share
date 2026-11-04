# Data model: Why this number?

Nothing is stored. The explanation is derived in the browser from data the page already has.

## Inputs (existing)

| Source | Fields used |
|---|---|
| Member balance (`GET …/balances`) | `member_id`, `paid`, `owed`, `sent`, `received`, `net` |
| Expense (`GET …/expenses`) | `id`, `description`, `amount`, `payer_id`, `spent_at`, `shares[]` (`member_id`, `amount`) |
| Settlement (`GET …/settlements`) | `id`, `from_member_id`, `to_member_id`, `amount`, `settled_at`, `note` |
| Notice (`GET …/notices`) | `from_member_id`, `to_member_id`, `amount`, `status` |

## Derived: BalanceExplanation (one person, one household)

| Field | Meaning |
|---|---|
| `memberId` | Whose balance |
| `lines` | Exactly four, in this order: `spent` (+), `share` (−), `paidBack` (+), `gotBack` (−) |
| `net` | `spent − share + paidBack − gotBack`, equal to the balance's `net` |
| `waiting` | Notices involving the person whose status is `sent`: the other person, the amount, and whether the person sent or receives it |

### ExplanationLine

| Field | Meaning |
|---|---|
| `kind` | `spent` \| `share` \| `paidBack` \| `gotBack` |
| `total` | From the balance: `paid`, `owed`, `sent`, `received` respectively (whole đồng, ≥ 0) |
| `items` | Newest first (date, then id) |
| `inStep` | `true` when the items add up exactly to `total` (research R2) |

### Items

- **ExpenseItem** (`spent`, `share`): `expenseId`, `description`, `spentAt`, `payerId`, `amount` (the
  whole expense), `part` (for `spent`: the whole amount; for `share`: the person's share).
  - `spent` lists expenses where `payer_id` is the person.
  - `share` lists expenses with a share for the person whose amount is greater than 0.
- **RepaymentItem** (`paidBack`, `gotBack`): `settlementId`, `settledAt`, `otherMemberId`, `amount`,
  `note`.
  - `paidBack`: settlements from the person; `gotBack`: settlements to the person.

## Invariants (each one is a unit test)

1. `lines.length === 4`, in the order above, every `total` an integer ≥ 0.
2. `net === spent − share + paidBack − gotBack === balance.net`.
3. When the data is in step, for each line the sum of `part` (expenses) or `amount` (repayments) equals
   `total`; otherwise that line's `inStep` is false and no list is shown.
4. A 0 đồng share never appears under `share`; paying for an expense you have no share in appears only
   under `spent`.
5. Members no longer in the household keep their id in items; the page shows them with the existing
   removed-member look.
6. Notices never change any total.
