# Data model: "Mới ghi"

Nothing is stored on the server. Two derived shapes and one browser record.

## RecentItem (derived, `lib/recent.ts`)

| Field | Rule |
|---|---|
| `kind` | `'expense'` or `'repayment'` |
| `id` | the expense or settlement id (unique together with `kind`) |
| `savedKey` | `savedKey(created_at)`, `YYYY-MM-DDTHH:MM:SS.ffffff` |
| `savedAt` | the original `created_at`, for showing the time |
| `recorderMemberId` | the member whose `user_id` is `created_by`, or `null` when no member has it now |
| `amount` | the expense or settlement amount |
| `description` | expense only |
| `fromMemberId` | repayment only: who paid |

## SeenMarks (browser, key `fair-share:seen:<userId>:<householdId>`)

```json
{ "expenses": "2026-11-06T07:05:12.000123", "settlements": null }
```

## Rules (each one is a test)

1. A record is listed only if `created_by` is a number other than the signed-in account's id.
2. With marks: listed when `savedKey` > the mark of its own list (null mark = everything in that list).
   Without any stored marks: listed when saved within the last 7 days by the device clock.
3. Expenses and repayments are merged and ordered by `savedKey`, newest first; ties by kind then id
   (stable, deterministic).
4. The recorder's name is their member's short name, else the removed-member name.
5. "Đã xem tất cả" writes, per list, the greatest `savedKey` among the records the strip was built from,
   only if later than the stored one; a mark never moves back.
6. No members, expenses or settlements loaded (pending or failed) → no items and no mark change.
7. A blocked or broken storage reads as no marks and ignores writes, without throwing.
