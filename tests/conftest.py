# tests/conftest.py: pytest loads this BEFORE any test module.
#
# Every test gets its own app from create_app(), started inside `with TestClient(...)` so the
# start-up code (migrations, opening the database pool) runs exactly as it does under Uvicorn.
# DATABASE_URL comes from the environment: CI sets it to its PostgreSQL service; locally it is
# usually unset, and the tests marked @pytest.mark.db are skipped.
import os
from dataclasses import replace

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

os.environ.setdefault("APP_ENV", "test")


def _db_reachable() -> bool:
    url = Settings.from_env().database_url
    if not url:
        return False
    try:
        with psycopg.connect(url, connect_timeout=2):
            return True
    except psycopg.Error:
        return False


def pytest_collection_modifyitems(config, items):
    """Skip @pytest.mark.db tests when no database is reachable. In CI a missing database is a
    failure, never a silent skip."""
    if os.getenv("CI") or _db_reachable():
        return
    skip = pytest.mark.skip(reason="no PostgreSQL reachable (runs in CI)")
    for item in items:
        if "db" in item.keywords:
            item.add_marker(skip)


@pytest.fixture
def db_url() -> str:
    return Settings.from_env().database_url


@pytest.fixture
def cleanup(db_url, client):
    """Remove the households a test created. API test modules use it with
    `pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]`.

    Depends on `client` so the app's start-up has applied the schema first.
    """
    with psycopg.connect(db_url) as conn:
        before = conn.execute("SELECT coalesce(max(id), 0) FROM households").fetchone()[0]
    yield
    with psycopg.connect(db_url) as conn:
        # Expenses first, as DELETE /api/households/{id} does (see db/migrations/001_init.sql).
        conn.execute("DELETE FROM expenses WHERE household_id > %s", (before,))
        conn.execute("DELETE FROM households WHERE id > %s", (before,))


@pytest.fixture
def make_client():
    """A started test client, optionally with other settings: make_client(database_url=None)."""
    clients = []

    def _make(**overrides) -> TestClient:
        settings = replace(Settings.from_env(), **overrides)
        client = TestClient(create_app(settings), raise_server_exceptions=False)
        clients.append(client)
        return client.__enter__()

    yield _make
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def client(make_client) -> TestClient:
    return make_client()
