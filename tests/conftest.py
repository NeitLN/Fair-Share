# tests/conftest.py: pytest loads this BEFORE any test module.
#
# Every test gets its own app from create_app(), started inside `with TestClient(...)` so the
# start-up code (migrations, opening the database pool) runs exactly as it does under Uvicorn.
# DATABASE_URL comes from the environment: CI sets it to its PostgreSQL service; locally it is
# usually unset, and the tests marked @pytest.mark.db are skipped.
import os
import re
import uuid
from dataclasses import replace

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.routers import accounts, me

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


@pytest.fixture(autouse=True)
def generous_limits(monkeypatch):
    """Every test request comes from the same address, and the suite signs up hundreds of accounts:
    the real limits (app/routers/accounts.py) would stop it. The tests of those limits set them
    back with monkeypatch."""
    monkeypatch.setattr(accounts, "REGISTER_PER_IP", 1_000_000)
    monkeypatch.setattr(accounts, "LOGIN_PER_IP", 1_000_000)
    monkeypatch.setattr(accounts, "JOIN_PER_IP", 1_000_000)
    monkeypatch.setattr(me, "PHOTO_PER_IP", 1_000_000)


@pytest.fixture
def cleanup(db_url, client):
    """Remove the households and accounts a test created. API test modules use it with
    `pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]`.

    Depends on `client` so the app's start-up has applied the schema first.
    """
    with psycopg.connect(db_url) as conn:
        before = conn.execute("SELECT coalesce(max(id), 0) FROM households").fetchone()[0]
        users_before = conn.execute("SELECT coalesce(max(id), 0) FROM users").fetchone()[0]
    yield
    with psycopg.connect(db_url) as conn:
        # Expenses first, as DELETE /api/households/{id} does (see db/migrations/001_init.sql).
        conn.execute("DELETE FROM expenses WHERE household_id > %s", (before,))
        conn.execute("DELETE FROM households WHERE id > %s", (before,))
        conn.execute("DELETE FROM users WHERE id > %s", (users_before,))


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# Requests that work without a session, so the client does not sign up for them
_OPEN_PATHS = re.compile(r"^/($|health|api/version|api/auth/)")
_SETTLEMENTS = re.compile(r"^/api/households/\d+/settlements$")


class AuthedClient(TestClient):
    """Signed in, as the web app is: at its first request it signs up an account of its own, the
    owner of every household it then creates, and sends its token with every request.

    `sign_up()` makes more accounts (tests/api.py `member()` uses it to add housemates the way the
    app does: an invite code, then the owner's approval), and it remembers which account has which
    name. A repayment can only be recorded by the person who received it, so a POST of a settlement
    goes out with the receiver's token. A request that sets Authorization itself keeps its own;
    `anonymous()` gives a client that never sends one.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.token: str | None = None
        self.user: dict | None = None
        self.member_tokens: dict[int, str] = {}  # member id → the token of the account with it
        self.unnamed_owner: dict[int, int] = {}  # household → the owner's name, not yet renamed

    def anonymous(self) -> TestClient:
        return TestClient(self.app, raise_server_exceptions=False)

    def sign_up(self, display_name: str = "Chủ nhà", email: str | None = None) -> str:
        email = email or f"{uuid.uuid4().hex}@test.local"
        response = super().request(
            "POST",
            "/api/auth/register",
            json={"email": email, "password": "test-password", "display_name": display_name},
        )
        assert response.status_code == 201, response.text
        return response.json()["token"]

    def request(self, method, url, *args, headers=None, **kwargs):
        path = str(url).split("?")[0]
        headers = dict(headers or {})
        if "Authorization" not in headers and not _OPEN_PATHS.match(path):
            if self.token is None and self.app.state.settings.database_url:
                self.token = self.sign_up()
            token = self.token
            body = kwargs.get("json")
            if method.upper() == "POST" and _SETTLEMENTS.match(path) and isinstance(body, dict):
                token = self.member_tokens.get(body.get("to_member_id"), token)
            if token:
                headers.update(bearer(token))
        response = super().request(method, url, *args, headers=headers, **kwargs)
        if method.upper() == "POST" and path == "/api/households" and response.status_code == 201:
            created = response.json()
            self.unnamed_owner[created["id"]] = created["member_id"]
            self.member_tokens[created["member_id"]] = headers["Authorization"].split()[1]
        return response


@pytest.fixture
def make_client():
    """A started test client, optionally with other settings: make_client(database_url=None)."""
    clients = []

    def _make(**overrides) -> AuthedClient:
        settings = replace(Settings.from_env(), **overrides)
        client = AuthedClient(create_app(settings), raise_server_exceptions=False)
        clients.append(client)
        return client.__enter__()

    yield _make
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def client(make_client) -> AuthedClient:
    return make_client()
