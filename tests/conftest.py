# tests/conftest.py: pytest loads this BEFORE any test module.
#
# Every test gets its own app from create_app(), started inside `with TestClient(...)` so the
# start-up code (migrations, opening the database pool) runs exactly as it does under Uvicorn.
# DATABASE_URL comes from the environment: CI sets it to its PostgreSQL service; locally it is
# usually unset, and the tests marked @pytest.mark.db are skipped.
import os
import re
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


KEY_HEADER = "X-Household-Key"
_HOUSEHOLD_PATH = re.compile(r"/api/households/(\d+)")
_ITEM_PATH = re.compile(r"/api/(members|expenses|settlements)/(\d+)")
_LIST_PATH = re.compile(r"/api/households/(\d+)/(members|expenses|settlements)$")


class KeyedClient(TestClient):
    """Sends each household's key with the requests that need it, as the web app does (#132).

    It learns the key from the answer to creating a household, and which household a member,
    expense or settlement belongs to from the answers that list or create them. A request that sets
    X-Household-Key itself keeps its own value; `without_key()` gives a client that never sends one.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.household_keys: dict[int, str] = {}
        self.owners: dict[tuple[str, int], int] = {}

    def without_key(self) -> TestClient:
        return TestClient(self.app, raise_server_exceptions=False)

    def _key_for(self, path: str) -> str | None:
        if match := _HOUSEHOLD_PATH.match(path):
            return self.household_keys.get(int(match[1]))
        if match := _ITEM_PATH.match(path):
            household_id = self.owners.get((match[1], int(match[2])))
            return self.household_keys.get(household_id) if household_id else None
        return None

    def _learn(self, method: str, path: str, response) -> None:
        if not response.content or not response.headers.get("content-type", "").startswith(
            "application/json"
        ):
            return
        body = response.json()
        if method == "POST" and path == "/api/households" and response.status_code == 201:
            self.household_keys[body["id"]] = body["key"]
        kind = _LIST_PATH.match(path) or _ITEM_PATH.match(path)
        if kind:
            table = kind[2] if _LIST_PATH.match(path) else kind[1]
            for item in body if isinstance(body, list) else [body]:
                if isinstance(item, dict) and "id" in item and "household_id" in item:
                    self.owners[(table, item["id"])] = item["household_id"]

    def request(self, method, url, *args, headers=None, **kwargs):
        path = str(url).split("?")[0]
        headers = dict(headers or {})
        if KEY_HEADER not in headers and (key := self._key_for(path)):
            headers[KEY_HEADER] = key
        response = super().request(method, url, *args, headers=headers, **kwargs)
        self._learn(method.upper(), path, response)
        return response


@pytest.fixture
def make_client():
    """A started test client, optionally with other settings: make_client(database_url=None)."""
    clients = []

    def _make(**overrides) -> KeyedClient:
        settings = replace(Settings.from_env(), **overrides)
        client = KeyedClient(create_app(settings), raise_server_exceptions=False)
        clients.append(client)
        return client.__enter__()

    yield _make
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def client(make_client) -> KeyedClient:
    return make_client()
