"""/health/db against a real PostgreSQL, an unreachable one, and none at all.

CI provides a database (the postgres service in .github/workflows/ci-cd.yml). Locally the first
test is skipped when no database is reachable, so `pytest -q` still works without Docker.
"""
import os

import psycopg
import pytest

from app.config import Settings
from app.db import get_conn


def _db_reachable() -> bool:
    url = Settings.from_env().database_url
    if not url:
        return False
    try:
        with psycopg.connect(url, connect_timeout=2):
            return True
    except psycopg.Error:
        return False


# In CI a missing database is a failure, never a silent skip.
requires_db = pytest.mark.skipif(
    not os.getenv("CI") and not _db_reachable(),
    reason="no PostgreSQL reachable (runs in CI)",
)


@requires_db
def test_health_db_reads_the_database(client):
    response = client.get("/health/db")
    assert response.status_code == 200
    body = response.json()
    assert body["db"] == "ok"
    assert body["notes"] >= 1


@requires_db
def test_pool_survives_many_requests(client):
    """More requests than the pool has connections: each one must be returned to the pool."""
    for _ in range(12):
        assert client.get("/health/db").status_code == 200


def test_health_db_reports_unreachable_database_safely(make_client):
    client = make_client(database_url="postgresql://nobody:pw@127.0.0.1:1/none", db_timeout=1)
    response = client.get("/health/db")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"
    # The host, user and driver error stay in the server log, never in the response.
    assert "127.0.0.1" not in response.text
    assert "nobody" not in response.text


def test_health_db_without_database_url(make_client):
    client = make_client(database_url=None)
    response = client.get("/health/db")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_not_configured"


def test_health_db_reports_a_database_without_schema_as_not_ready(make_client):
    """Reachable but empty (a new Supabase project): a safe 503, not a 500."""

    class EmptyDatabase:
        def execute(self, query):
            raise psycopg.errors.UndefinedTable('relation "notes" does not exist')

    client = make_client(database_url=None)
    client.app.dependency_overrides[get_conn] = lambda: EmptyDatabase()
    response = client.get("/health/db")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_not_initialized"
    assert "notes" not in response.text
