# Persistence drill (T-27)

**Owner:** Võ Hoàng Minh · **Reviewer:** Võ Việt Tiến · Source for report §5 ("restart and pause").

The brief asks that the application's data survives a restart and that the database can be recovered.
All Fair-Share state lives in PostgreSQL; the API keeps nothing on its own disk. This drill proves
three things: a backup can be taken, it restores into a working copy, and a restarted API still shows
the same data.

## Tools

| Script | What it does |
|---|---|
| [`scripts/db-backup.sh`](../scripts/db-backup.sh) | `pg_dump` of the `public` schema (tables, data, RLS) to `backups/fairshare-<UTC time>.sql.gz`. Remote: `DATABASE_URL='…' sh scripts/db-backup.sh`; local: `--compose`. pg_dump runs in the official `postgres` image of the **server's own major version** (pg_dump must not be older than the server). The URL goes to the container through the environment, never on a command line or into the output |
| [`scripts/db-restore.sh`](../scripts/db-restore.sh) | `docker compose down -v`, restore the file into a fresh Compose database, start the stack, print rows per table. Refuses to run without `--yes`, because it deletes the local database |

`backups/` is git-ignored and excluded from the Docker build context: a backup is user data and is
never committed. Keep copies outside the repository (for example a private Drive folder).

## Run 1: local Compose (22/10/2026), done

A throw-away Compose project (`COMPOSE_PROJECT_NAME=fsdrill`), so nobody's own local data was touched.

| Step | Result |
|---|---|
| Data entered through the web app's API: the demo household, an electricity bill of **450 001 đ** split equally (the leftover đồng goes to the lowest id), a dinner of 240 000 đ split by custom amounts, one settlement | Balances: Tiến **+150 000**, Minh **+30 000**, Duy Anh **−180 000**; suggested: Duy Anh → Tiến 150 000, Duy Anh → Minh 30 000 |
| `sh scripts/db-backup.sh --compose` | 2.1 KB; households 1, members 3, expenses 2, expense_shares 6, settlements 1, schema_migrations 1 |
| `sh scripts/db-restore.sh <file>` without `--yes` | Refused, nothing deleted |
| `sh scripts/db-restore.sh <file> --yes` (database wiped, restored) | Same row counts |
| Balances and expenses fetched again and compared byte for byte | **Identical**, including ids, shares and `created_at` |
| A new member added after the restore | Got id 4: the identity sequences came back too, no id collision |
| API log after the restore | No "applied migration": `schema_migrations` came with the backup, so the API changed nothing |
| `docker compose restart api`, then the `api` container recreated | Same data each time |
| Remote mode (`DATABASE_URL`) against the drill database | Detected PostgreSQL 16, dumped with pg_dump 16; the password does not appear in the output or the file. With a wrong password: "Could not reach the database … Nothing written." |

## Run 2: Supabase and Render, to do

Needs the Supabase **session pooler** connection string (Supabase dashboard → *Connect*, or the
`DATABASE_URL` value on Render). Paste it only into your own terminal, never into a chat or a file.

1. **Before:** open one household (`https://fair-share-4bu9.onrender.com/api/households/<id>`) and its
   balances (`/api/households/<id>/balances`); save both pages as `before-*.json` (not in the repo).
2. **Backup:**
   ```bash
   read -rs DATABASE_URL && export DATABASE_URL     # paste, Enter (nothing is shown)
   sh scripts/db-backup.sh
   unset DATABASE_URL
   ```
   Write down the file size, the server version it prints and the rows per table.
3. **Restore locally:** `sh scripts/db-restore.sh backups/<that file> --yes`, then open
   `http://localhost:3000`: the households from production must be there, and
   `http://localhost:8000/api/households/<id>/balances` must equal `before-balances.json`.
4. **Restart the live API:** Render dashboard → `fair-share-4bu9` → *Manual Deploy → Restart service*
   (or re-run the `deploy` job of the latest CI/CD run on `main`). Wait until `/health` answers, then
   fetch the same two pages again: they must equal the `before-*.json` files.
5. Fill in the table below and tick #46.

| Step | Result (fill in) |
|---|---|
| Server version printed by the backup | |
| Backup size and rows per table | |
| Local restore: households and balances equal production | |
| Render restart: time until `/health` answered | |
| After the restart: households and balances equal the "before" files | |

## Problems we met

| Problem | Fix |
|---|---|
| The first restore stopped at `schema "public" already exists`: pg_dump writes `CREATE SCHEMA public`, and every new database already has that schema | The restore leaves out exactly that line (and pg_dump 17's `SET transaction_timeout`, unknown to an older local server); any other error still stops it |
| A wrong `DATABASE_URL` made the backup carry on with an empty version and leave a broken file | The script stops before writing anything, and deletes any dump that does not contain our tables |
| A pg_dump older than the server refuses to run, and a newer server version is possible on Supabase | The script asks the server for its version first and uses the matching `postgres` image |
| On 22/10 the live `/health/db` answered 503 (pool timeout) when checked at 07:10 UTC, with the code unchanged, and was back about half an hour later | Recovered on its own; the reason is in the Render log (`database unavailable: …`). This is why we keep our own backups instead of relying on the free tier |

## What makes the data survive

- **Restart or redeploy of the API:** the API is stateless. Every request takes a connection from a
  pool that is re-opened at start-up and tests each connection before use, so a restart only costs the
  cold start (~50 s on the free tier) and the data never moved.
- **Supabase paused for inactivity:** the daily keep-alive (`keep-alive.yml`, T-26) runs a real query,
  and a paused project is resumed from the dashboard before a demo. While it is paused the API answers a
  clear `503` instead of crashing.
- **Schema:** the migrations are recorded in `schema_migrations`, so a fresh database, a restored backup
  and the live database all reach the same schema without manual SQL.
