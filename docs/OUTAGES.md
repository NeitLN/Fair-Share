# Outages of the live database

A record of every time the live API lost its database: what the users saw, what the logs say, what we
changed. It is a source for report §5 ("restart and pause", "problems we met") and for the defense.
Times are Vietnam time (UTC+7); the Render log shows them in the viewer's time zone.

| Date | Down (approx.) | Users saw | Cause, as far as we can tell |
|---|---|---|---|
| Thu 22/10/2026 | ~14:10 → ~14:45 | `503 database_unavailable` on pages that read data; `/health` stayed up | Not investigated in the log (outside its 24 h window when we looked); same symptom as 23/10 |
| Fri 23/10/2026 | 14:07 → 14:32 (≈ 25 min) | Same | The database behind Supabase's pooler was unreachable; our retries then got the project blocked for ~2 more minutes (below) |

Both started at about the same time of day. None of our scheduled workflows runs then (dashboard
06:00, keep-alive 08:00, weekly report Fri 09:00), and Supabase's status page lists no pooler or Tokyo
incident between 20 and 23/10. Two days are too few to call it a pattern; if it happens again at the
same hour, that is worth a support ticket to Supabase.

## 23/10: what the Render log shows

Read on 23/10 from the API's application log (Render dashboard → `fair-share-4bu9` → Logs, custom
range). Host names and addresses of the pooler are left out here.

| Time | Log | Meaning |
|---|---|---|
| 14:07:50, 14:08:11 | `database unavailable: couldn't get a connection after 5.00 sec` → `GET /health/db … 503` | A request waited the pool's 5 s and got a clean 503 |
| 14:07:54 → 14:08:15 | `error connecting in 'pool-1': connection timeout expired`, for each of the pooler's 3 addresses | Nothing answered on the pooler's port: a network-level failure, not a refusal |
| 14:29:30 | `couldn't get a connection after 5.00 sec` → 503 | Still down |
| 14:29:32 → 14:29:57 | `FATAL: (EAUTHQUERY) auth_query secret check timed out` · `authentication query failed: connection to database not available` | The pooler answered again, but **it could not reach our database** to check the password |
| 14:30:07 → 14:32:05 | `FATAL: (ECIRCUITBREAKER) too many authentication failures, new connections are temporarily blocked` | The pooler **blocked new connections for our project**, after many failed logins in a row |
| 14:32:29 | `GET /health/db … 200 OK` | Back |
| all along | `GET /health … 200 OK` every 5 s | The API itself never stopped: Render did not restart it, and nothing was lost |

## What went right

- **`/health` never touches the database**, so Render's health check stayed green and did not restart
  a healthy API in a loop.
- Every failing request got **`503 database_unavailable`** with a safe message; the host, user and
  driver error stayed in the server log (`app/errors.py`). The web app shows its error note with
  *Thử lại* (T-32).
- **No data was lost**: the API is stateless and every write is committed before its response.

## What went wrong on our side, and the fix

While the database was down, the connection pool kept trying to reconnect. Every attempt goes to each
of the pooler's addresses, and two retry chains often ran at once (the pool keeping its one minimum
connection, and one growing for a waiting request), so each round meant several failed logins. That is
what tripped the pooler's circuit breaker, and it kept us down for about two minutes after the database
itself was reachable again.

Fix in **#127** (`app/db.py`):

| Change | Effect |
|---|---|
| `reconnect_timeout=60` (was psycopg_pool's default, 300 s) | The pool's own retries (1, 2, 4, 8… s apart) stop after a minute |
| `DatabaseCooldown`: after a failed attempt, requests get the same 503 at once for 20 s, without touching the pool | Requests no longer add attempts during an outage, and users get their 503 at once instead of after 5 s |
| An idle connection the pool got back ends the cooldown at once | Recovery is not delayed by the cooldown |

## What we still don't know

Why the database behind the pooler was unreachable. The Supabase side has the answer: dashboard →
project → **Logs → Postgres** around 14:00–14:35 on 23/10 (a restart such as `database system is
ready`, or `out of memory`). To fill in here when someone checks it.

## Before a demo

1. Open `/health/db` on the live API ([runbook, T-38](ROADMAP.md)): `{"db": "ok"}` means ready.
2. A `503` that lasts more than a minute: check the Supabase dashboard (project paused? status page?)
   and the Render log for the messages above.
3. If it does not come back, present from local Compose with a restored backup
   ([PERSISTENCE_DRILL.md](PERSISTENCE_DRILL.md)) and say why: that is the point of
   keeping our own backups.
