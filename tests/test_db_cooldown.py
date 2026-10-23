"""While the database is down the API backs off instead of retrying on every request.

On 23/10/2026 the pool kept retrying Supabase's pooler during an outage, each attempt failing
authentication on every pooler address, until the pooler blocked our project for a few more minutes
(docs/PERSISTENCE_DRILL.md, "Outages"). These tests pin the behaviour that prevents it.
"""
import time
from contextlib import contextmanager

from psycopg_pool import PoolTimeout

from app.db import ConnDep, DatabaseCooldown, create_pool


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


class FakePool:
    """Stands in for the connection pool: fails or hands out a connection, and counts attempts."""

    def __init__(self):
        self.down = True
        self.idle = 0
        self.attempts = 0

    @contextmanager
    def connection(self):
        self.attempts += 1
        if self.down:
            raise PoolTimeout("couldn't get a connection after 5.00 sec")
        yield object()

    def get_stats(self):
        return {"pool_available": self.idle}


def client_with(make_client, pool: FakePool, clock: Clock):
    client = make_client(database_url=None)
    client.app.state.pool = pool
    client.app.state.db_cooldown = DatabaseCooldown(20, clock=clock)

    @client.app.get("/test/db")
    def uses_the_database(conn: ConnDep):
        return {"ok": True}

    return client


def test_the_cooldown_starts_on_failure_ends_after_its_time_and_clears_on_success():
    clock = Clock()
    cooldown = DatabaseCooldown(20, clock=clock)
    assert not cooldown.blocked()
    cooldown.failed()
    assert cooldown.blocked()
    clock.now += 19.9
    assert cooldown.blocked()
    clock.now += 0.2
    assert not cooldown.blocked()
    cooldown.failed()
    cooldown.succeeded()
    assert not cooldown.blocked()


def test_after_a_failure_requests_get_503_without_another_attempt(make_client):
    pool, clock = FakePool(), Clock()
    client = client_with(make_client, pool, clock)

    first = client.get("/test/db")
    assert first.status_code == 503
    assert first.json()["error"]["code"] == "database_unavailable"
    assert pool.attempts == 1

    # The next requests in the following 20 s get the same safe answer, and the pooler is left alone
    for _ in range(5):
        response = client.get("/test/db")
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "database_unavailable"
    assert pool.attempts == 1


def test_after_the_cooldown_one_request_tries_again_and_success_clears_it(make_client):
    pool, clock = FakePool(), Clock()
    client = client_with(make_client, pool, clock)
    client.get("/test/db")

    # Still down 20 s later: one more attempt, then another 20 s of quiet
    clock.now += 20
    assert client.get("/test/db").status_code == 503
    assert client.get("/test/db").status_code == 503
    assert pool.attempts == 2

    # The database is back
    clock.now += 20
    pool.down = False
    assert client.get("/test/db").status_code == 200
    assert client.get("/test/db").status_code == 200
    assert pool.attempts == 4


def test_a_connection_the_pool_got_back_on_its_own_is_used_at_once(make_client):
    """No reason to keep refusing once the pool has reconnected in the background."""
    pool, clock = FakePool(), Clock()
    client = client_with(make_client, pool, clock)
    client.get("/test/db")

    pool.down, pool.idle = False, 1
    assert client.get("/test/db").status_code == 200
    assert pool.attempts == 2


def test_errors_inside_a_route_do_not_start_the_cooldown(make_client):
    """Only failing to get a connection means the database is down; a bug in a route does not."""
    pool, clock = FakePool(), Clock()
    pool.down = False
    client = client_with(make_client, pool, clock)

    @client.app.get("/test/broken")
    def broken(conn: ConnDep):
        raise RuntimeError("a bug, not an outage")

    assert client.get("/test/broken").status_code == 500
    assert not client.app.state.db_cooldown.blocked()
    assert client.get("/test/db").status_code == 200


def test_an_unreachable_database_answers_fast_after_the_first_failure(make_client):
    """With a real pool and nothing listening: the first request waits for the pool's timeout, the
    next ones are answered straight away."""
    client = make_client(database_url="postgresql://nobody:pw@127.0.0.1:1/none", db_timeout=1)
    assert client.get("/health/db").status_code == 503

    started = time.monotonic()
    response = client.get("/health/db")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"
    assert time.monotonic() - started < 0.5


def test_the_pool_stops_retrying_on_its_own_after_a_minute():
    pool = create_pool("postgresql://nobody:pw@127.0.0.1:1/none", timeout=1)
    assert pool.reconnect_timeout == 60
