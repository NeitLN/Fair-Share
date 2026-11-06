# Data model: Recurring expenses

## New table `recurring_items` (migration 006)

| Column | Type | Rule |
|---|---|---|
| `id` | `bigint GENERATED ALWAYS AS IDENTITY` | PK |
| `household_id` | `bigint NOT NULL` | FK households, `ON DELETE CASCADE` |
| `description` | `text NOT NULL` | 1–120 characters (same rule as expenses) |
| `category` | `text NOT NULL DEFAULT 'other'` | same seven codes as `expenses.category` |
| `payer_id` | `bigint NOT NULL` | not a foreign key: checked when an expense is saved from the item, like `member_ids` |
| `member_ids` | `bigint[] NOT NULL` | `cardinality` 1–50, shared equally |
| `amount` | `bigint` | NULL (varies each month) or > 0 |
| `day` | `smallint NOT NULL` | 1–31 |
| `active` | `boolean NOT NULL DEFAULT true` | false once stopped |
| `created_by` | `bigint` | FK users, `ON DELETE SET NULL` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `stopped_at` | `timestamptz` | set when stopped |

RLS enabled, no policies (like every table).

## `expenses` (existing), one new column

| Column | Type | Rule |
|---|---|---|
| `recurring_item_id` | `bigint` | FK `recurring_items(id)` `ON DELETE SET NULL`; NULL for every existing row |

`expenses_recurring_month_uidx`: unique on `(recurring_item_id, date_trunc('month',
spent_at::timestamp without time zone)::date)` where `recurring_item_id IS NOT NULL`.

## Rules (each one is a test)

1. At most one expense per item per month of `spent_at`, on insert and on update; violation → 409, nothing kept.
2. A `POST` with `recurring` creates the item and the expense together; custom split → 422; 21st active item → 409.
3. A `POST` with `recurring_item_id`: the item must be in the same house (else 404) and active (else 409).
4. `PUT` never changes `recurring_item_id`.
5. Deleting an expense frees its month; stopping an item keeps its expenses' links.
6. Only the creator or the owner stops an item; strangers and people waiting get 404.
7. Deleting a house removes its items.
8. Existing expenses have no item; balances and reports are unchanged by the migration.

## Due (SPA, `lib/recurring.ts`)

`dueDay(day, "YYYY-MM")` = min(day, last day of that month). An active item is `recorded` this month if an
expense links to it with `spent_at` in this month; otherwise `due` if today's day ≥ `dueDay`, else `later`.
