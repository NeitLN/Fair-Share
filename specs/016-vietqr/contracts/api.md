# API contract: receiving accounts and payment details

All under the signed-in session. Errors keep `{"error": {"code", "message"}}`. Answers that hold an account number send `Cache-Control: no-store`.

## Own account (profile, no house: FR-007, FR-012)

`GET /api/me/receiving-account`

- `200 {"account": null}` or `200 {"account": {"bank_bin": "970436", "bank_name": "Vietcombank", "account_number": "0123456789", "holder_name": "NGUYEN VAN MINH", "version": "a1b2c3d4e5f6", "supported": true}}`. `supported: false` when the saved BIN is no longer in the list (Edge Cases).

`PUT /api/me/receiving-account` body `{"bank_bin", "account_number", "holder_name"}`

- The server cleans: number = digits after removing spaces, dots and dashes; name = FR-003. `200` with the account as above (new `version`).
- `422 unknown_bank` (BIN not in the list or not taking transfers); `422 bad_account_number` (not 6 to 19 digits after cleaning, or other characters); `422 bad_holder_name` (empty or over 50 after cleaning); the usual `422` for wrong types.

`DELETE /api/me/receiving-account` → `204` (also when none was saved).

## Hint in the members list (FR-011)

`GET /api/households/{id}/members`: each `Member` gains `"receiving_hint": {"bank_name": "Vietcombank", "last4": "6789"} | null`. `null` for a member with no live owner/member link, no account, or an unsupported BIN.

## Payment details for one transfer (FR-008 to FR-015, FR-021)

`GET /api/households/{household_id}/members/{member_id}/payment[?acknowledge={notice_version}]`

Checks in order:

1. no session → `401`;
2. not an approved owner/member of `household_id` → `404 household_not_found` (identical to a house that does not exist);
3. `member_id` not a current owner/member of that house → `404 member_not_found` (identical to an id that does not exist);
4. `member_id` is the asker, or no suggested transfer from the asker to that member right now → `409 payment_not_suggested` (no data);
5. otherwise `200` with the snapshot (data-model.md):

```json
{ "state": "partly_told", "suggested": 120000, "told": 100000, "amount": 20000, "notice_version": 812,
  "account": { "bank_bin": "970436", "bank_name": "Vietcombank", "account_number": "0123456789",
               "holder_name": "NGUYEN VAN MINH" },
  "message": "FS NhaTroQ7 Lan", "snapshot": "9f2c41d07ab3" }
```

- `no_account`, `covered`, `declined` carry no `account` and no `message`.
- `?acknowledge` is ignored unless the notice is declined and its version equals the value; then the state is `declined_acknowledged` with details.
- Nothing is written; no balance or notice changes (FR-020).

Errors on every step use the existing codes and messages; the answers for steps 2 and 3 never depend on whether an account exists (SC-004).
