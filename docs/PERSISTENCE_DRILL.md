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

## Run 2: Supabase and Render (29/10 → 02/11), done

Hoàng Minh ran the restart part; Việt Tiến took the backup and the restore (#46), because the backup
needs the Supabase **database password** and only the project's owner has it. To repeat it, it is also
[RUNBOOK](RUNBOOK.md) §1 step 10. Do **not** reset the password to get around this: Render's
`DATABASE_URL` would stop working until it is updated.

The connection string is the **session pooler** URI (Supabase dashboard → *Connect* → Session pooler, or
the `DATABASE_URL` value on Render). Paste it only into your own terminal, never into a chat or a file.

1. **Before:** create a household for the drill, or use one whose invite link you have. Households open
   only with their key (#132), so send it as a header:
   `curl -H "X-Household-Key: <key>" https://fair-share-4bu9.onrender.com/api/households/<id>` and the same
   for `/members`, `/expenses`, `/settlements` and `/balances`. Save each page as `before-*.json` (not in
   the repo).
2. **Backup:**
   ```bash
   read -rs DATABASE_URL && export DATABASE_URL     # paste, Enter (nothing is shown)
   sh scripts/db-backup.sh
   unset DATABASE_URL
   ```
   Write down the file size, the server version it prints and the rows per table.
3. **Restore locally:** `COMPOSE_PROJECT_NAME=fsdrill sh scripts/db-restore.sh backups/<that file> --yes`
   (the project name keeps your own local database untouched), then fetch the same pages from
   `http://localhost:8000/api/households/<id>/...` with the same key: they must equal the `before-*.json`
   files.
4. **Restart the live API:** Render dashboard → `fair-share-4bu9` → *Manual Deploy → Restart service*,
   or re-run the `deploy` job of the latest CI/CD run on `main`. Any merge to `main` redeploys it too.
   Wait until `/api/version` answers, then fetch the same pages again: they must equal the `before-*.json`
   files.
5. Fill in the table below and tick #46.

| Step | Result |
|---|---|
| Drill household | Created on the live site on 29/10 through the API, with the same kind of data as run 1: id 72, "Drill T-27 (giữ lại đến 12/11)", 3 members, an electricity bill of 450 001 đ split equally, a 240 000 đ dinner split by custom amounts, one settlement. Balances +190 000 / +10 000 / −200 000 đ (sum 0) |
| Restart 1: the `deploy` job re-run on `main` (30/10), same commit 521b470 | All five pages **byte-identical** |
| Restart 2: the #147 merge redeployed the API, 521b470 → 38898d5 (30/10) | Byte-identical |
| Restart 3: the #152 merge, → e60c0c7 (31/10) | Byte-identical |
| Restart 4: the freeze merges, → fce1e23 (02/11) | Byte-identical |
| Server version printed by the backup | PostgreSQL **17** on Supabase, so the script dumped with pg_dump 17 (02/11) |
| Backup size and rows per table | 3 644 bytes; households 13, members 31, expenses 11, expense_shares 32, settlements 5, schema_migrations 2. The password does not appear in the output or the file, which stays in the git-ignored `backups/` on Việt Tiến's laptop |
| Local restore into PostgreSQL 16 (`fsdrill` project, `main` at fce1e23) | 90 s including starting the stack. The `SET transaction_timeout` line that pg_dump 17 writes was skipped as designed; same row counts; `schema_migrations` still 2, so no migration ran again, and the seed added nothing |
| Local restore: the drill household equals production | Household 72 on the restored copy and on the live API, with the same key: all five pages (99, 264, 619, 166 and 436 bytes) **byte-identical** |

**Found during run 2:** the Supabase dashboard shows *Last backup: No backups*. The free plan keeps no
backups of its own, so `db-backup.sh` is the only way back after a lost table or a deleted project.

## Problems we met

| Problem | Fix |
|---|---|
| The first restore stopped at `schema "public" already exists`: pg_dump writes `CREATE SCHEMA public`, and every new database already has that schema | The restore leaves out exactly that line (and pg_dump 17's `SET transaction_timeout`, unknown to an older local server); any other error still stops it |
| A wrong `DATABASE_URL` made the backup carry on with an empty version and leave a broken file | The script stops before writing anything, and deletes any dump that does not contain our tables |
| A pg_dump older than the server refuses to run, and a newer server version is possible on Supabase | The script asks the server for its version first and uses the matching `postgres` image |
| On 22/10 (and again on 23/10) the live `/health/db` answered 503 (pool timeout) with the code unchanged, for about half an hour | The database behind Supabase's pooler was unreachable, and our pool's retries then got the project blocked by the pooler for a few more minutes. Recorded in [OUTAGES.md](OUTAGES.md); the API now backs off while the database is down (#127). This is also why we keep our own backups |

## What makes the data survive

- **Restart or redeploy of the API:** the API is stateless. Every request takes a connection from a
  pool that is re-opened at start-up and tests each connection before use, so a restart only costs the
  cold start (~50 s on the free tier) and the data never moved.
- **Supabase paused for inactivity:** the daily keep-alive (`keep-alive.yml`, T-26) runs a real query,
  and a paused project is resumed from the dashboard before a demo. While it is paused the API answers a
  clear `503` instead of crashing.
- **Schema:** the migrations are recorded in `schema_migrations`, so a fresh database, a restored backup
  and the live database all reach the same schema without manual SQL.
