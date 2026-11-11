# API contract changes: Notices tell one story

Only two routes change. Everything else, including telling, adding, declining and taking back, is as in spec 014.

## POST /api/households/{id}/notices/{from_member}/accept

**Body** (`NoticeAccept`):

```json
{ "version": 12, "received": 30000, "settled_at": "2026-11-12", "warned_suggestion": 10000 }
```

| Field | Type | Meaning |
|---|---|---|
| `version` | int | as today |
| `received` | int, optional | as today. Defaults to the notice amount |
| `settled_at` | day | as today |
| `warned_suggestion` | int ≥ 0, optional | **new.** The pair's suggestion the person was warned about. 0 means no suggestion |

**Runs under the exclusive household lock.**

**Answers:**

| Case | Status | Body |
|---|---|---|
| `received` ≤ current suggestion | 201 | the repayment, as today |
| above it, `warned_suggestion` missing | 409 | `{"error": {"code": "warning_required", "message": "…", "details": {"suggestion": <int>}}}` |
| above it, `warned_suggestion` ≠ current suggestion | 409 | `suggestion_changed` (existing code) |
| above it, `warned_suggestion` = current suggestion | 201 | the repayment |
| version mismatch, or the notice gone or not sent | 409 | `notice_changed` (existing) |
| `received` > notice amount | 422 | as today |

## DELETE /api/settlements/{id}

**Runs under the exclusive household lock**, then the pair's notice row lock.

| Case | Effect | Status |
|---|---|---|
| `notice_amount` null or 0 | delete only | 204 |
| pair has a sent notice | delete; notice `amount += notice_amount`, new version | 204 |
| pair has no notice | delete; insert a sent notice of `notice_amount` | 204 |
| pair has a declined notice | delete; `amount += notice_amount`, `status = 'sent'`, new version | 204 |
| a member of the pair no longer in the house | delete only | 204 |
| resulting notice amount > 10¹² | nothing changes | 422 `amount_too_large` |
| not owner or author | as today | 403 |
