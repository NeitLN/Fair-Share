# 5. Database schema and integration

*Owner: Hoàng Minh. Sources: [`db/migrations/`](../../db/migrations/), [`app/migrate.py`](../../app/migrate.py),
[`app/db.py`](../../app/db.py), [PERSISTENCE_DRILL.md](../PERSISTENCE_DRILL.md), [OUTAGES.md](../OUTAGES.md).*

Production data lives in **Supabase PostgreSQL**, attached to the API by one environment variable,
`DATABASE_URL`. Locally, Compose runs `postgres:16-alpine`. Our own migrations create the schema in both,
so they reach the same state with no manual SQL.

![Database schema](../diagrams/er.png)

A **household** has **members**; an **expense** is paid by one member and split into **expense_shares**; a
**settlement** records one member paying another back. `schema_migrations` records which migrations ran.

| Decision | Why |
|---|---|
| Money is whole đồng (`bigint`), never a float | Sums are exact and easy to test |
| The **API guarantees** shares add up to the amount | The database checks each share (`≥ 0`), the API the sum, in the same transaction. The equal split gives the leftover đồng to the lowest member ids (100 000 between three: 33 334 / 33 333 / 33 333); custom shares that do not add up get `422 split_mismatch` |
| Balances are **computed, not stored**: `net = paid − owed + sent − received` | Nothing to keep in sync; the nets of a household always sum to 0 (property-tested) |
| Payers and settlement sides must belong to the household | Composite foreign keys `(household_id, member_id)`: even a buggy request cannot mix two households |
| Member names unique per household, ignoring case; `CHECK` constraints mirror the API's limits | A unique index on `(household_id, lower(name))`. The API answers a clear 422 first; the database is the last line of defence |
| Row Level Security on every table, no policies | Closes the REST API Supabase publishes for `public` tables; our API owns the tables, which RLS does not restrict |
| A member used by an expense or settlement cannot be deleted | Foreign keys without `ON DELETE`: `409 member_in_use` instead of silently changed balances |
| A secret `access_key` per household (`002_household_keys.sql`, #132) | Ids are sequential; the database makes 32 random hex characters per household, and requests without it get `404` |

**Migrations.** Numbered SQL files in `db/migrations/` are applied by the API **at start-up**: under a
PostgreSQL **advisory lock** (two instances cannot apply a file twice), each file not yet in
`schema_migrations` runs **in its own transaction** and is recorded; a failing file rolls back completely.
An unreachable database is logged and the API starts anyway, so `/health` stays green; an SQL error stops
it, so a broken deploy fails instead of half-applying a schema. Files are never edited; a change is a new
file (`002` added the household keys and gave every existing household one). Tests cover a repeated run, a
failing file and two concurrent runs.

**How the API uses it.** Supabase's **session pooler** (IPv4) with `sslmode=require`; a `psycopg_pool` of
1–5 connections, each **tested before use** so dead ones are replaced after a restart or pause; one
transaction per request, committed before the response (section 2); parameterised SQL, no ORM. A database
that is down gives `503 database_unavailable`; `/health/db` runs one real query and reports the schema
version, while `/health` never touches the database.

**Restart, pause and restore**

| Event | What happens | Evidence |
|---|---|---|
| API restarted or redeployed | Nothing is lost: the API keeps no data | Drill: restarting and recreating the API container kept every row |
| Restore from our backup | `scripts/db-backup.sh` (pg_dump matched to the server) and `db-restore.sh` | Local drill, 22/10: wiped and restored, balances and expenses **byte-identical**, ids continued, no migration re-applied |
| Supabase pauses an idle project | The API answers `503`, `/health` stays up | Daily keep-alive query; resumed from the dashboard before a demo |
| Production backup and Render restart | Same scripts against the Supabase URL; data compared before and after | *To fill in from run 2 of the drill* |

| Problem we met | Fix |
|---|---|
| Deleting a household with shared expenses failed: PostgreSQL checked the members' foreign keys before the nested cascade had run | Delete the expenses first, then the household, in one transaction; caught by a test (#83, #84) |
| On 22 and 23/10 `/health/db` answered 503 for about half an hour with no code change; the log showed the pooler unreachable, then **blocking our project** (`ECIRCUITBREAKER`) because our pool kept retrying | Back off: the pool stops retrying after 60 s and requests get the 503 at once for 20 s (#127). No data lost; the cause on Supabase's side is still open |

**How we know it works.** 320 backend tests run on every pull request against a real PostgreSQL 16: the
migration runner, every rule above written directly to the database, every endpoint, and property tests of
the money logic (2 000 random splits, 5 000 random balance sets). The broken split in draft PR #113 is
caught, and branch protection blocks it.
