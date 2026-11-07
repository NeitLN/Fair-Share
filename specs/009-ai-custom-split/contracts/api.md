# API contract: `POST /api/households/{id}/ai/parse-expense`

Request, errors, limits and the single retry are unchanged (ARCHITECTURE §6). Only the `200` body grows.

## Equal split (unchanged)

```json
{"draft": {"description": "Lẩu", "amount": 500000, "payer_id": 2, "spent_at": "2026-11-07", "source": "ai",
           "split": {"type": "equal", "member_ids": [1, 2, 3]}},
 "warnings": []}
```

## Custom split

"lẩu 500k Tiến trả, Minh 200k, Lan 100k" (Tiến 1, Minh 2, Lan 3):

```json
{"draft": {"description": "Lẩu", "amount": 500000, "payer_id": 1, "spent_at": "2026-11-07", "source": "ai",
           "split": {"type": "custom",
                     "shares": [{"member_id": 1, "amount": 200000}, {"member_id": 2, "amount": 200000},
                                {"member_id": 3, "amount": 100000}],
                     "rest_to": 1, "rest_amount": 200000, "rest_to_payer": true}},
 "warnings": []}
```

Guarantees: `shares` in member id order, every amount an int ≥ 0, `sum(amount) == draft.amount`, at most
`MAX_PARTICIPANTS` entries, every `member_id` a member with an account. `rest_to` is null and
`rest_amount` 0 when the named amounts cover the total. `payer_id` may be null when the rest went to a
named person ("còn lại mình"); the usual `no_payer` warning is then present.

## Blocked split

"lẩu 500k Lan trả, Minh 300k, Duy Anh 300k":

```json
{"draft": {"description": "Lẩu", "amount": 500000, "payer_id": 3, "spent_at": "2026-11-07", "source": "ai",
           "split": {"type": "blocked", "reason": "over_total",
                     "preview": [{"member_id": 2, "amount": 300000}, {"member_id": 4, "amount": 300000}]}},
 "warnings": [{"code": "over_total", "message": "The named amounts add up to 600000, more than the total 500000",
               "named_sum": 600000, "total": 500000}]}
```

`preview` is for display only; it never adds up by promise and is never a usable split. Exactly one
warning has `code == split.reason`. Its figures:

| reason | figures |
|---|---|
| `over_total` | `named_sum`, `total` |
| `no_rest_taker`, `nobody_for_equal_rest` | `remainder` |
| `unknown_member`, `ambiguous_member`, `duplicate_member` | `name` (as written) |
| `no_total`, `fraction_or_percent`, `several_payers`, `paid_amount`, `payer_not_sharing`, `unreadable_shares` | none |

`DraftWarning.named_sum`, `total`, `remainder` are optional ints, absent (null) for every other code.
Existing warning codes and texts do not change.
