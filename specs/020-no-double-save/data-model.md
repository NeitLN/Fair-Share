# Data model: No double save

## Migration `013_draft_ids.sql`

Number 013: no spec 013 migration was on GitHub when this was built; spec 013 takes the next free number if this lands first.

```sql
ALTER TABLE expenses    ADD COLUMN draft_id uuid, ADD COLUMN draft_fingerprint text;
ALTER TABLE settlements ADD COLUMN draft_id uuid, ADD COLUMN draft_fingerprint text;
CREATE UNIQUE INDEX expenses_draft    ON expenses    (household_id, created_by, draft_id) WHERE draft_id IS NOT NULL;
CREATE UNIQUE INDEX settlements_draft ON settlements (household_id, created_by, draft_id) WHERE draft_id IS NOT NULL;
```

- **Nullable:** old rows and requests without an identity keep NULL.
- **Freed on delete:** a deleted row takes its identity with it (FR-005), because the index only covers live rows.
- **Not shown in the UI:** `draft_fingerprint` is never sent to the page. `draft_id` is returned on settlements only, so a card can tell its unknown press landed (research R4).

## Draft lifecycle (page)

```text
new (UUID) ──press──► sending ──201/200──► done ─► new draft
                         │
                         ├─ answered refusal (4xx not draft_already_saved) ─► same draft (form) / new (card)
                         ├─ draft_already_saved ─► same draft + "Xem" / "Ghi thành khoản mới" (new draft, then save)
                         └─ result unknown ─► same draft (kept until its record is seen, for a card)
```
