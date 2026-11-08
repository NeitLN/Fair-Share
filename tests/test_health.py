from app.config import APP_VERSION


def test_root(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["version"] == APP_VERSION
    assert "message" in response.json()


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_works_without_a_database(make_client):
    """Render restarts the service if /health fails, so it must never depend on the database."""
    client = make_client(database_url=None)
    assert client.get("/health").status_code == 200


def test_version_reports_the_commit(make_client):
    client = make_client(commit="abc1234")
    response = client.get("/api/version")
    assert response.status_code == 200
    assert set(response.json()) == {"app", "version", "env", "commit", "ai"}
    assert response.json()["commit"] == "abc1234"


# specs/011-first-impressions, FR-017 and FR-018: whether quick add can work here, yes or no only
def test_version_says_whether_ai_is_set_up_without_the_key(make_client):
    without = make_client(gemini_api_key=None).get("/api/version")
    assert without.json()["ai"] is False
    assert without.headers["cache-control"] == "no-store"

    key = "AIza-test-key-that-must-stay-on-the-server"
    with_key = make_client(gemini_api_key=key).get("/api/version")
    assert with_key.json()["ai"] is True
    assert with_key.headers["cache-control"] == "no-store"
    assert key not in with_key.text


def test_starter_items_are_gone(client):
    assert client.get("/items").status_code == 404
