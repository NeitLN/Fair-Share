# API contract changes: No double save

## POST /api/households/{id}/expenses

The body gains an optional field:

| Field | Type | Meaning |
|---|---|---|
| `draft_id` | UUID v4, optional | The draft's identity. Missing: today's behaviour |

**Answers:**

| Case | Status | Body |
|---|---|---|
| New draft (no record with this identity) | 201 | the expense, as today |
| Repeat, same fingerprint | 200 | the existing expense as it is now |
| Repeat, different fingerprint | 409 | `{"error": {"code": "draft_already_saved", "message": "…", "details": {"kind": "expense", "id": <int>}}}` |
| Malformed `draft_id` | 422 | validation error |
| Everything else | as today, but only when no record with this identity exists | |

## POST /api/households/{id}/settlements

The body gains two optional fields:

| Field | Type | Meaning |
|---|---|---|
| `draft_id` | UUID v4, optional | as above |
| `draft_kind` | `"form"` (default) or `"card"` | `"card"` leaves `settled_at` out of the fingerprint (S3) |

**Answers:** the same table, with `"kind": "settlement"`. A repeat changes no notice.

**Response body:** a settlement in the list and in the create answer now includes `draft_id` (or null).
