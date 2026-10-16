"""Every failure answers {"error": {"code", "message"}} and never leaks internals."""

import pytest

from app.errors import ApiError


@pytest.fixture
def client(make_client):
    client = make_client()
    app = client.app

    # Throw-away routes that fail on purpose, added to this test's app only.
    @app.get("/test/api-error")
    def api_error():
        raise ApiError(409, "member_in_use", "This member already has expenses")

    @app.get("/test/number/{n}")
    def number(n: int):
        return {"n": n}

    @app.get("/test/crash")
    def crash():
        raise RuntimeError("secret detail: password=hunter2")

    return client


def test_api_error_uses_our_format(client):
    response = client.get("/test/api-error")
    assert response.status_code == 409
    assert response.json() == {
        "error": {"code": "member_in_use", "message": "This member already has expenses"}
    }


def test_unknown_route_uses_our_format(client):
    response = client.get("/no/such/route")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_wrong_method_keeps_the_allow_header(client):
    response = client.post("/health")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "method_not_allowed"
    assert "GET" in response.headers["allow"]


def test_validation_error_lists_the_bad_field(client):
    response = client.get("/test/number/abc")
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert error["details"][0]["loc"] == ["path", "n"]


def test_unexpected_error_hides_the_details(client):
    response = client.get("/test/crash")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert "hunter2" not in response.text
