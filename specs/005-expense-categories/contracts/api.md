# API contract: the expense category

No new route. Two existing bodies gain one field.

## Request: `POST /api/households/{id}/expenses`, `PUT /api/expenses/{id}`

```jsonc
{
  "description": "Tiền điện tháng 11",
  "amount": 450000,
  "payer_id": 1,
  "spent_at": "2026-11-03",
  "source": "manual",
  "category": "utilities",          // optional; one of food, groceries, utilities, rent,
                                    // transport, household, other; see the table
  "split": {"type": "equal", "member_ids": [1, 2, 3]}
}
```

| Case | Answer |
|---|---|
| `category` left out | `POST`: saved as `"other"`, `201`. `PUT`: the stored category is kept, `200` (review of #199) |
| a valid code | saved, returned as sent |
| any other value (`"Food"`, `""`, `3`, `null`) | `422 validation_error`, `details[].loc = ["body", "category"]`; nothing saved |
| caller may not change the expense | unchanged: `403 forbidden` or `404` as today |

## Response: every expense (`GET` list, `GET` one, `POST`, `PUT`)

Adds `"category": "<code>"`, always present. Older rows answer `"other"`.

## Unchanged

`POST /api/households/{id}/ai/parse-expense` and its draft; balances; settlements; notices.
