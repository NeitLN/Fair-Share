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
    assert set(response.json()) == {"app", "version", "env", "commit"}
    assert response.json()["commit"] == "abc1234"


def test_starter_items_are_gone(client):
    assert client.get("/items").status_code == 404
