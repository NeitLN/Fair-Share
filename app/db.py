"""One PostgreSQL connection pool for the whole API process.

Opening a new connection costs a TLS handshake to Supabase on every request; a pool keeps a few
open and hands them out. The pool is opened at start-up without waiting, so the API starts (and
/health answers) even while the database is paused or unreachable.

While the database is down the API must not keep knocking: every attempt goes to each address of
Supabase's pooler, and on 23/10/2026 enough failed attempts made the pooler block our project for a
few minutes after the database itself was back (docs/OUTAGES.md). So the pool
stops retrying on its own after a minute, and after a failure the API answers 503 at once for a
short while instead of trying again on every request.
"""

from collections.abc import Callable, Iterator
from contextlib import ExitStack
from time import monotonic
from typing import Annotated, Any

import psycopg
from fastapi import Depends, Request
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout

from app.errors import ApiError

# After the database could not be reached, how long requests are answered 503 without trying
DB_RETRY_AFTER = 20.0


def create_pool(database_url: str, timeout: float) -> ConnectionPool:
    return ConnectionPool(
        database_url,
        min_size=1,
        max_size=5,  # well under Supabase's free-tier connection limit
        timeout=timeout,  # how long getconn() waits before raising PoolTimeout
        # Test each connection before handing it out: after a database restart or pause the old
        # connections are dead, and the pool replaces them instead of failing the request.
        check=ConnectionPool.check_connection,
        kwargs={"connect_timeout": 3},
        # The pool's own retries (1, 2, 4, 8… s apart) stop after a minute instead of five; after
        # that only a request makes it try again, and DatabaseCooldown spaces those out.
        reconnect_timeout=60,
        open=False,
    )


class DatabaseCooldown:
    """Remembers that the database just failed, so requests do not all retry it.

    After a failure, `blocked()` is True for `seconds`: the API answers 503 straight away. The
    first request after that tries the database again; success clears it, failure restarts it.
    """

    def __init__(self, seconds: float = DB_RETRY_AFTER, clock: Callable[[], float] = monotonic):
        self.seconds = seconds
        self.clock = clock
        self.until = 0.0

    def blocked(self) -> bool:
        return self.clock() < self.until

    def failed(self) -> None:
        self.until = self.clock() + self.seconds

    def succeeded(self) -> None:
        self.until = 0.0


def _has_idle_connection(pool: ConnectionPool) -> bool:
    """The pool reconnected on its own: no reason to keep refusing requests."""
    return pool.get_stats().get("pool_available", 0) > 0


def get_conn(request: Request) -> Iterator[Connection]:
    """FastAPI dependency: a pooled connection, one transaction per request.

    The transaction commits when the route returns and rolls back if it raises. A pool timeout or
    a dropped connection is turned into a safe 503 by the handlers in app/errors.py.
    Always use it through ConnDep below, never a bare Depends(get_conn).
    """
    pool: ConnectionPool | None = request.app.state.pool
    if pool is None:
        raise ApiError(503, "database_not_configured", "The database is not configured")
    cooldown: DatabaseCooldown = request.app.state.db_cooldown
    if cooldown.blocked() and not _has_idle_connection(pool):
        # Failed a moment ago: answer at once, without another attempt against the pooler
        raise ApiError(503, "database_unavailable", "The database is not reachable right now")
    with ExitStack() as stack:
        try:
            conn = stack.enter_context(pool.connection())
        except (PoolTimeout, psycopg.OperationalError):
            cooldown.failed()
            raise
        cooldown.succeeded()
        # Leaving the `with` commits, or rolls back if the route raised (pool.connection() does it)
        yield conn


# In a route: def list_things(conn: ConnDep): ...
# scope="function": the code after `yield` (the COMMIT) runs as soon as the route returns, before
# the response is sent. With the default scope ("request") it would run after the response, so a
# client could read just after a write and miss it, or get a 201 for data whose commit failed.
ConnDep = Annotated[Connection, Depends(get_conn, scope="function")]


def fetch_one(conn: Connection, sql: str, params: tuple = ()) -> dict[str, Any] | None:
    """The first row as {column: value}, or None if there is none."""
    return conn.cursor(row_factory=dict_row).execute(sql, params).fetchone()


def fetch_all(conn: Connection, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    """Every row as {column: value}."""
    return conn.cursor(row_factory=dict_row).execute(sql, params).fetchall()
