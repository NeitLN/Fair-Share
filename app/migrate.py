"""Applies db/migrations/*.sql at API start-up, each file exactly once (docs/ARCHITECTURE.md §4).

A fresh Supabase project and a fresh Compose volume reach the same schema with no manual step:

* Files run in name order (001_, 002_, ...) and each one is recorded in `schema_migrations`.
* Each file runs in its own transaction: if a statement fails, the whole file is rolled back and
  not recorded, and the API refuses to start (so a broken migration fails the deploy, not the data).
* A PostgreSQL advisory lock is held throughout, so two API instances starting at the same moment
  cannot apply the same file twice: the second waits, then finds it already recorded.

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

# Any fixed number works, as long as every API instance uses the same one.
LOCK_ID = 72_261_001


def migrate(database_url: str, directory: Path = MIGRATIONS_DIR) -> list[str]:
    """Apply the pending migrations; return the versions applied now (empty if up to date)."""
    files = sorted(directory.glob("*.sql"))
    with psycopg.connect(database_url, autocommit=True, connect_timeout=3) as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", (LOCK_ID,))
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

    Households can only be opened with their invite link (#132), so the demo households' links are
    written to the log. Never set on Render: there the keys must not reach the logs.
    """
    with psycopg.connect(database_url, connect_timeout=3) as conn:
        conn.execute(path.read_text(encoding="utf-8"))
        rows = conn.execute("SELECT id, name, access_key FROM households ORDER BY id LIMIT 5")
        for household_id, name, key in rows.fetchall():
            logger.info("demo household %r: open /households/%s#k=%s", name, household_id, key)


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
