"""Tests that need a real PostgreSQL.

CI provides one (the postgres service in .github/workflows/ci-cd.yml). Locally they are skipped
when no database is reachable, so `pytest -q` still works without Docker.
"""
import os

import psycopg
import pytest
from fastapi.testclient import TestClient

from app import main

client = TestClient(main.app)


def _db_reachable() -> bool:
    try:
        with psycopg.connect(main.DATABASE_URL, connect_timeout=2):
            return True
    except psycopg.Error:
        return False


# In CI a missing database is a failure, never a silent skip.
requires_db = pytest.mark.skipif(
    not os.getenv("CI") and not _db_reachable(),
    reason="no PostgreSQL reachable (runs in CI)",
)


@requires_db
def test_health_db_reads_the_database():
    response = client.get("/health/db")
    assert response.status_code == 200
    body = response.json()
    assert body["db"] == "ok"
    assert body["notes"] >= 1


def test_health_db_reports_unreachable_database(monkeypatch):
    monkeypatch.setattr(main, "DATABASE_URL", "postgresql://nobody@127.0.0.1:1/none")
    assert client.get("/health/db").status_code == 503


def test_health_db_without_database_url(monkeypatch):
    monkeypatch.setattr(main, "DATABASE_URL", None)
    assert client.get("/health/db").status_code == 503
