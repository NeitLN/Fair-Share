"""CORS: only the origins in ALLOWED_ORIGINS may call the API from a browser on another site."""

import pytest

from app.config import Settings

WEB = "https://fair-share-web.onrender.com"


@pytest.fixture
def cors_client(make_client):
    return make_client(allowed_origins=(WEB,))


def test_allowed_origin_gets_the_header(cors_client):
    response = cors_client.get("/api/version", headers={"Origin": WEB})
    assert response.headers["access-control-allow-origin"] == WEB


def test_other_origin_gets_no_header(cors_client):
    response = cors_client.get("/api/version", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers


def test_preflight_for_a_json_post_is_allowed(cors_client):
    response = cors_client.options("/api/version", headers={
        "Origin": WEB,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert response.status_code == 200
    assert "POST" in response.headers["access-control-allow-methods"]


def test_no_origins_means_no_cors_headers(make_client):
    client = make_client(allowed_origins=())
    response = client.get("/api/version", headers={"Origin": WEB})
    assert "access-control-allow-origin" not in response.headers


def test_allowed_origins_are_read_from_a_comma_separated_list(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", f" {WEB}/ , http://localhost:5173,")
    assert Settings.from_env().allowed_origins == (WEB, "http://localhost:5173")
