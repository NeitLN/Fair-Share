# API contract: Overview and lists that read right

## `GET /api/households` (changed, read only)

```json
{
  "households": [
    {
      "id": 240, "name": "Nhà trọ Q7", "created_at": "…", "role": "owner", "member_id": 497,
      "my_net": 5633500,
      "waiting": 2
    }
  ],
  "pending": [{ "household_id": 300, "requested_at": "…" }]
}
```

- `my_net`: integer đồng, sign as in `GET /api/households/{id}/balances` for the caller's member.
- `waiting`: integer ≥ 0; join requests waiting (owner only) + notices sent to the caller with status `sent`.
- Same access as today: only the caller's own houses. No new route.

## `PUT /api/me/gender` (unchanged route, new notice version)

The accepted `notice` becomes `2026-11-v2`; `2026-11-v1` is now a `422`, like any old version (spec 010, FR-029).

Nothing else changes in the API.
