# API contract: notices and repayments

All under the signed-in session; `{hid}` is the household. Errors keep the format `{"error": {"code", "message"}}`.
Amounts are JSON integers (strings, booleans, fractions → 422). `version` is the notice version the screen showed,
or `null` when it showed no notice for that pair.

## Notice (response shape)

```json
{ "from_member_id": 3, "to_member_id": 1, "amount": 1000000, "status": "sent",
  "note": "chuyển trước một nửa", "version": 812, "created_at": "2026-11-09T08:00:00Z" }
```

`GET /api/households/{hid}/notices` → list of the above (adds `note`, `version`).

## Telling (payer) — PR-1 keeps the full amount, PR-2 opens the ceiling

`PUT /api/households/{hid}/notices` body `{ "to_member_id", "amount", "note"?, "version" }`

- 200 → the notice (new version). Creates, or replaces a `declined` one.
- 409 `notice_changed`: `version` is not the current one (or null while one exists, or a number while none).
- 409 `suggestion_changed`: the pair is not suggested now, or `amount` > the suggestion. (PR-1: `amount` must equal
  it, as today.)
- 422 `same_member`, `unknown_member`; validation.

`POST /api/households/{hid}/notices/{to}/add` body `{ "amount", "note"?, "version" }` (PR-2)

- 200 → the notice with `amount` increased. Only on a `sent` notice.
- 409 `notice_changed` (version, or notice declined/gone), 409 `suggestion_changed` (total > suggestion), 422 (total
  > 10^12 or validation).

`DELETE /api/households/{hid}/notices/{to}?version={v}` → 204; 409 `notice_changed` when `v` is not current.

## Answering (receiver)

`POST /api/households/{hid}/notices/{from}/accept` body `{ "version", "received"?, "settled_at" }`

- 201 → the repayment (`notice_amount` = received). `received` defaults to the whole amount, else 1..amount.
- The notice is reduced by `received`; deleted at 0.
- 409 `notice_changed`; 403 when the caller is not the receiver; 422 when `received` > amount.

`POST /api/households/{hid}/notices/{from}/decline` body `{ "version" }` → 200 the notice (`declined`); 409
`notice_changed`.

## Repayments

`POST /api/households/{hid}/settlements` body adds optional `"notice": { "version" }`

- With it: told money. `notice_amount = min(amount, notice.amount)`; the notice is reduced. 409 `notice_changed`
  when the version is not current (nothing recorded).
- Without it: an independent repayment; notices unchanged (today's equal-amount removal is dropped).

`DELETE /api/settlements/{id}` → 204. When the repayment has `notice_amount` and its pair has no notice, a `sent`
notice of that amount is created (no note, new version). The response body is unchanged; the page refetches
notices.

`Settlement` (response) adds `notice_amount: int | null`.
