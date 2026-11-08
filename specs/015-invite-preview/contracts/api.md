# API contract

All need a session (401 otherwise).

## POST /api/invites/preview

Body `{ "code": "k7qm-2xrt" }` (read like `/api/join`, rule J1).

- 200 `{ "house_name": "Nhà trọ Q7", "owner_name": "Tiến", "member": false }`; with `"member": true` also
  `"household_id": 12`.
- 404 `invalid_code`: byte for byte the answer `/api/join` gives a wrong, expired or replaced code.
- 429 `too_many_attempts` (J2 buckets, shared with `/api/join`) or `too_many_previews` (30 a minute per account), with
  `Retry-After`. The preview cap never blocks `/api/join`.

## GET /api/me/requests

```json
{ "pending": [{ "household_id": 7, "household_name": "Nhà trọ Q7", "owner_name": "Tiến",
                "requested_at": "2026-11-09T08:00:00Z" }],
  "joined": [3, 12],
  "outcomes": [{ "id": 41, "household_id": 9, "household_name": "Nhà B", "owner_name": "Minh",
                 "kind": "refused", "happened_at": "2026-11-08T10:00:00Z" }] }
```

Only the caller's rows; outcomes older than 30 days are not returned (and are removed).

## DELETE /api/me/outcomes/{id}

204; 404 when it is not the caller's (or already gone).

## Changed

- `GET /api/households`: each `pending` item gains `household_name` and `owner_name`.
- `POST /api/households/{id}/requests/{user}/reject`: also records a `refused` outcome for that user.
- `DELETE /api/households/{id}`: also records a `house_deleted` outcome for each person waiting.
- `POST /api/join`: a new waiting request removes the caller's outcomes for that house.
