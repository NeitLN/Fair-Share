"""One PostgreSQL connection pool for the whole API process.

Opening a new connection costs a TLS handshake to Supabase on every request; a pool keeps a few
open and hands them out. The pool is opened at start-up without waiting, so the API starts (and
/health answers) even while the database is paused or unreachable.
"""

from collections.abc import Iterator
from typing import Annotated, Any

from fastapi import Depends, Request
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.errors import ApiError


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
        open=False,
    )


def get_conn(request: Request) -> Iterator[Connection]:
    """FastAPI dependency: a pooled connection, one transaction per request.

    The transaction commits when the route returns and rolls back if it raises. A pool timeout or
    a dropped connection is turned into a safe 503 by the handlers in app/errors.py.
    """
    pool: ConnectionPool | None = request.app.state.pool
    if pool is None:
        raise ApiError(503, "database_not_configured", "The database is not configured")
    with pool.connection() as conn:
        yield conn


# In a route: def list_things(conn: ConnDep): ...
ConnDep = Annotated[Connection, Depends(get_conn)]


def fetch_one(conn: Connection, sql: str, params: tuple = ()) -> dict[str, Any] | None:
    """The first row as {column: value}, or None if there is none."""
    return conn.cursor(row_factory=dict_row).execute(sql, params).fetchone()


def fetch_all(conn: Connection, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    """Every row as {column: value}."""
    return conn.cursor(row_factory=dict_row).execute(sql, params).fetchall()
