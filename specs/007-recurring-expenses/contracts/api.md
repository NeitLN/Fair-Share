# API contract: recurring expenses

## Expense body (`POST /api/households/{id}/expenses`; `PUT /api/expenses/{id}` ignores both new fields)

```jsonc
{
  "description": "Tiền nhà", "amount": 4500000, "payer_id": 2, "spent_at": "2026-11-01",
  "category": "rent", "split": {"type": "equal", "member_ids": [1, 2, 3]},
  "recurring": {"varying_amount": false},   // optional: make this new expense recur
  "recurring_item_id": 7                     // optional: this expense is item 7's record
}
```

At most one of `recurring` / `recurring_item_id` (both → 422 `validation_error`).

| Case | Answer |
|---|---|
| `recurring` with an equal split | 201; the expense has `recurring_item_id` of the new item |
| `recurring` with a custom split | 422 `recurring_needs_equal_split` |
| `recurring` when 20 items are active | 409 `too_many_recurring` |
| `recurring_item_id` of another house or unknown | 404 `recurring_not_found` |
| `recurring_item_id` of a stopped item | 409 `recurring_stopped` |
| a second expense for the same item and month (POST, or PUT moving the date) | 409 `recurring_month_taken`, `details: {"expense_id": <existing>}`; nothing saved |

Every expense response adds `"recurring_item_id": <id> | null`.

## `GET /api/households/{id}/recurring`

200, the active items, oldest first:

```jsonc
[{"id": 7, "household_id": 1, "description": "Tiền nhà", "category": "rent", "payer_id": 2,
  "member_ids": [1, 2, 3], "amount": 4500000, "day": 1, "created_by": 10, "created_at": "…"}]
```

`amount` is null for a varying item. Strangers and people waiting: 404 `household_not_found`.

## `POST /api/recurring/{id}/stop`

204. Creator or owner only (else 403 `forbidden`); unknown or another house's: 404 `recurring_not_found`.
Stopping a stopped item: 204, nothing changes.
