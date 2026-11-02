"""Small helpers for the API tests: create things through the API and read error codes.

The `cleanup` fixture that removes what a test created, and the signed-in client, live in
conftest.py.
"""

from tests.conftest import bearer


def household(client, name="Nhà trọ Q7") -> dict:
    """A household owned by the client's own account."""
    response = client.post("/api/households", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def member(client, household_id: int, name: str) -> dict:
    """A person in the household's split, with an account, the way the app adds one.

    The first name given to a new household is its owner's own (the client's account): the
    owner's name is renamed to it. Every later one is a new account that joins with the invite
    code and is approved by the owner. client.member_tokens then holds each name's token."""
    owner_name = client.unnamed_owner.pop(household_id, None)
    if owner_name is not None:
        response = client.patch(f"/api/members/{owner_name}", json={"name": name})
        assert response.status_code == 200, response.text
        return response.json()
    token = client.sign_up(display_name=name)
    code = client.get(f"/api/households/{household_id}/invite").json()["code"]
    joined = client.post("/api/join", json={"code": code}, headers=bearer(token))
    assert joined.json() == {"status": "pending", "household_id": None}, joined.text
    user_id = client.get("/api/auth/me", headers=bearer(token)).json()["id"]
    response = client.post(f"/api/households/{household_id}/requests/{user_id}/approve", json={})
    assert response.status_code == 200, response.text
    added = response.json()
    client.member_tokens[added["id"]] = token
    return added


def remove_access(client, household_id: int, member_id: int) -> None:
    """The owner takes away the access of the account with this name; the name stays."""
    token = client.member_tokens[member_id]
    user_id = client.get("/api/auth/me", headers=bearer(token)).json()["id"]
    response = client.delete(f"/api/households/{household_id}/people/{user_id}")
    assert response.status_code == 204, response.text


def error_code(response) -> str:
    return response.json()["error"]["code"]
