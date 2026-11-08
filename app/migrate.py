"""Applies db/migrations/*.sql at API start-up, each file exactly once (docs/ARCHITECTURE.md §4).

A fresh Supabase project and a fresh Compose volume reach the same schema with no manual step:

* Files run in name order (001_, 002_, ...) and each one is recorded in `schema_migrations`.
* Each file runs in its own transaction: if a statement fails, the whole file is rolled back and
  not recorded, and the API refuses to start (so a broken migration fails the deploy, not the data).
* A PostgreSQL advisory lock is held throughout, so two API instances starting at the same moment
  cannot apply the same file twice: the second waits, then finds it already recorded.
* The lock is only taken when a file is waiting, and waited for at most LOCK_WAIT. Waiting without a
  limit, a session left holding it (through the pooler, an instance stopped half way) would keep the
  API from ever opening its port, which looks like the two deploys that hung for 10 minutes (08/11,
  09/11). Up to date, a start never waits; with a file waiting and the lock still taken after
  LOCK_WAIT, the API refuses to start, saying who holds it, rather than run on a schema older than
  its code.

Also runnable by hand, e.g. against a restored database:  python -m app.migrate
"""

import logging
import sys
from pathlib import Path

import psycopg

from app.config import Settings

logger = logging.getLogger("uvicorn.error")

DB_DIR = Path(__file__).resolve().parent.parent / "db"
MIGRATIONS_DIR = DB_DIR / "migrations"
SEED_FILE = DB_DIR / "seed.sql"
# The household seed.sql creates, and the account of its owner (password in the README)
DEMO_HOUSEHOLD = "Nhà trọ Bình Thạnh"
DEMO_OWNER = "tien@demo.local"

# Any fixed number works, as long as every API instance uses the same one.
LOCK_ID = 72_261_001
# How long a start waits for another session's migration lock (a PostgreSQL lock_timeout value):
# far more than a migration takes, far less than Render's wait for the port
LOCK_WAIT = "30s"


class MigrationLockTimeout(RuntimeError):
    """A migration is waiting but another session held the lock for longer than LOCK_WAIT.

    Not an OperationalError on purpose: prepare_database() lets the API start without migrating only
    when the database cannot be reached, and here it can, so the start stops instead."""


def _pending(conn: psycopg.Connection, files: list[Path]) -> list[Path]:
    """The files not recorded yet, read without the lock (all of them on a fresh database)."""
    if conn.execute("SELECT to_regclass('schema_migrations')").fetchone()[0] is None:
        return files
    applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
    return [path for path in files if path.stem not in applied]


def _lock_holders(conn: psycopg.Connection) -> str:
    """Who holds the migration lock, for the log line (best effort: the role may not see them)."""
    try:
        rows = conn.execute(
            "SELECT a.pid, a.state, a.backend_start, a.application_name"
            " FROM pg_locks l JOIN pg_stat_activity a USING (pid)"
            # A bigint key is split: high 32 bits in classid, low in objid, objsubid 1 (the
            # two-int form of pg_advisory_lock uses objsubid 2, so it never matches)
            " WHERE l.locktype = 'advisory' AND l.classid = %s AND l.objid = %s"
            " AND l.objsubid = 1 AND l.granted",
            (LOCK_ID >> 32, LOCK_ID & 0xFFFFFFFF),
        ).fetchall()
    except psycopg.Error:
        return "unknown"
    return "; ".join(
        f"pid {pid} ({state}, since {start}, {app or 'no application_name'})"
        for pid, state, start, app in rows
    ) or "nobody any more"


def migrate(
    database_url: str, directory: Path = MIGRATIONS_DIR, lock_wait: str = LOCK_WAIT
) -> list[str]:
    """Apply the pending migrations; return the versions applied now (empty if up to date)."""
    files = sorted(directory.glob("*.sql"))
    with psycopg.connect(database_url, autocommit=True, connect_timeout=3) as conn:
        # Up to date: nothing to apply, so no lock to wait for
        if not _pending(conn, files):
            return []
        logger.info("waiting for migration lock %s (at most %s)", LOCK_ID, lock_wait)
        conn.execute("SELECT set_config('lock_timeout', %s, false)", (lock_wait,))
        try:
            conn.execute("SELECT pg_advisory_lock(%s)", (LOCK_ID,))
        except psycopg.errors.LockNotAvailable:
            holders = _lock_holders(conn)
            logger.error(
                "migration lock %s still held after %s by %s; not starting on an old schema",
                LOCK_ID, lock_wait, holders,
            )
            raise MigrationLockTimeout(
                f"migration lock {LOCK_ID} held for more than {lock_wait} by {holders}"
            ) from None
        # The migrations themselves keep the default (no lock timeout), as before
        conn.execute("SET lock_timeout = 0")
        logger.info("migration lock %s taken", LOCK_ID)
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                " version text PRIMARY KEY,"
                " applied_at timestamptz NOT NULL DEFAULT now())"
            )
            # Read only after taking the lock: another instance may have just applied a file.
            applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
            done = []
            for path in files:
                if path.stem in applied:
                    continue
                with conn.transaction():
                    conn.execute(path.read_text(encoding="utf-8"))
                    conn.execute(
                        "INSERT INTO schema_migrations (version) VALUES (%s)", (path.stem,)
                    )
                logger.info("applied migration %s", path.stem)
                done.append(path.stem)
            return done
        finally:
            # Unlock explicitly: through a connection pooler, closing our side may not end the
            # server session that holds the lock.
            conn.execute("SELECT pg_advisory_unlock(%s)", (LOCK_ID,))


def seed(database_url: str, path: Path = SEED_FILE) -> None:
    """Load the demo data (local Compose only; the file itself skips a non-empty database).

    Every page needs an account (docs/ACCOUNTS.md), so the log says which demo account to sign in
    with. Never set on Render: the demo accounts' password is public.
    """
    with psycopg.connect(database_url, connect_timeout=3) as conn:
        conn.execute(path.read_text(encoding="utf-8"))
        owner = conn.execute("SELECT 1 FROM users WHERE email = %s", (DEMO_OWNER,)).fetchone()
        if owner:
            logger.info(
                "demo household %r: sign in as %s (password in the README)",
                DEMO_HOUSEHOLD,
                DEMO_OWNER,
            )


def prepare_database(settings: Settings) -> None:
    """Start-up step: migrations, then the demo data if asked for.

    A database that cannot be reached must not stop the API from starting (/health has to answer
    and Render would otherwise restart it in a loop), so that case is logged and skipped; the next
    start applies the migrations. Any other failure, such as an error in a migration, is raised.
    """
    if not settings.database_url:
        return
    try:
        migrate(settings.database_url)
        if settings.seed_demo_data:
            seed(settings.database_url)
    except psycopg.OperationalError as exc:
        logger.error("database not reachable at start-up, migrations not applied: %s", exc)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    url = Settings.from_env().database_url
    if not url:
        sys.exit("DATABASE_URL is not set")
    applied = migrate(url)
    print("applied: " + ", ".join(applied) if applied else "already up to date")
