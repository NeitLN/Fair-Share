# tests/conftest.py: pytest loads this BEFORE any test module.
#
# Every test gets its own app from create_app(), started inside `with TestClient(...)` so the
# start-up code (opening the database pool) runs exactly as it does under Uvicorn.
# DATABASE_URL comes from the environment: CI sets it to its PostgreSQL service; locally it is
# usually unset, and the tests that need a database are skipped (see test_db.py).
import os
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

os.environ.setdefault("APP_ENV", "test")


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
