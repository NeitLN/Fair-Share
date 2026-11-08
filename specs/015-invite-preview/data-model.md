# Data model: An invited person knows which house they are joining

Migration `db/migrations/011_join_outcomes.sql` (new table only).

## join_outcomes (new)

| Column | Type | Rule |
|---|---|---|
| id | bigint identity | primary key |
| user_id | bigint | `REFERENCES users (id) ON DELETE CASCADE`; the requester, the only reader |
| household_id | bigint | no foreign key: the outcome survives the house's deletion |
| household_name | text | the house's name when it happened; `char_length <= 60` like house names |
| owner_name | text | the owner's display name when it happened; `char_length <= 40` |
| kind | text | `CHECK (kind IN ('refused', 'house_deleted'))` |
| happened_at | timestamptz | `NOT NULL DEFAULT now()` |

Index on `(user_id, happened_at)`. Row-level security on, like every table (Supabase REST cannot reach it).

Lifecycle: inserted by a refusal or a house deletion (same transaction that ends the request); deleted by the owner's
"Đã hiểu", by a new waiting request to the same `household_id`, or when older than 30 days (on read).

## Unchanged tables

- `household_users`: still deleted on refusal and cancel; `pending` rows now also yield the house and owner names in
  `GET /api/households` and `GET /api/me/requests`.
- `invite_codes`: read by the preview with the same query as join.

## Not stored

- The preview answer; the page keeps it only while that code stays in the field.
