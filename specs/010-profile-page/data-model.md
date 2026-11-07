# Data model: Profile page

Each PR adds its own migration (constitution III: new numbered files only; the numbers below assume the
PRs merge in order). RLS is enabled on every new table, with no policies, like the others.

## PR1: rename and password

No schema change. Uses `users.display_name`, `users.password_hash`, `sessions`, `household_users`,
`members` (unique `(household_id, lower(name))`) and `rate_limits` as they are.

## PR2: `007_user_status.sql`

| Column | Type | Rule |
|---|---|---|
| `users.status` | `text NULL` | `CHECK (char_length(status) BETWEEN 1 AND 60)`; null = no status |

## PR3: `008_user_photos.sql`

```text
user_photos
  user_id     bigint PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE
  image       bytea  NOT NULL CHECK (octet_length(image) <= 32768)   -- the server's own 256 × 256 JPEG
  version     text   NOT NULL CHECK (char_length(version) = 12)      -- first 12 hex of SHA-256(image)
  updated_at  timestamptz NOT NULL DEFAULT now()
ALTER TABLE user_photos ENABLE ROW LEVEL SECURITY;
```

- One row per account; a new photo is an `INSERT … ON CONFLICT (user_id) DO UPDATE`, removing is a
  `DELETE`. No history.
- The ceiling (52 428 800 bytes for all rows together) is checked in the writing transaction under an
  advisory lock (research R4), not by a constraint.

## PR4: `009_user_gender.sql`

| Column | Type | Rule |
|---|---|---|
| `users.gender` | `text NULL` | `CHECK (gender IN ('male', 'female', 'other'))` |
| `users.gender_notice` | `text NULL` | the notice version shown, e.g. `2026-11-v1` |
| `users.gender_set_at` | `timestamptz NULL` | when it was chosen |

`CHECK ((gender IS NULL) = (gender_notice IS NULL) AND (gender IS NULL) = (gender_set_at IS NULL))`:
all three together or none; Không nêu stores null in all three (FR-029).

## Derived: profile of a name in a household

The members query (`SELECT_MEMBERS` in `app/routers/households.py`) gains, through the existing
`LEFT JOIN household_users hu` and a new `LEFT JOIN users u ON u.id = hu.user_id` (and
`LEFT JOIN user_photos p ON p.user_id = hu.user_id` in PR3):

| Field on `Member` | Value | Present when |
|---|---|---|
| `status` | `u.status` | `hu.role IN ('owner', 'member')`, else null |
| `photo_version` | `p.version` | same |
| `gender` | `u.gender` | same |

A pending person never matches (their `member_id` is null), a person who left has no `household_users`
row, and a name from before accounts has no `user_id`, so all three are null for them. No email, hash or
notice field is ever selected.

## State changes

- **Rename**: `users.display_name` and each linked `members.name` change in one transaction; a member row
  whose new name collides stays as it was and is reported (research R6).
- **Password**: `users.password_hash` changes and every other `sessions` row of the account is deleted in
  one transaction under the user row lock (research R5).
- **Photo**: none → set → replaced → removed (none); each step replaces the single row or deletes it.
- **Gender**: none ↔ set (with notice); clearing deletes the value and its notice record together.
