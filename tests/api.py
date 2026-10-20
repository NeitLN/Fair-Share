"""Small helpers for the API tests: create things through the API and read error codes.

The `cleanup` fixture that removes what a test created lives in conftest.py.
"""


def household(client, name="Nhà trọ Q7") -> dict:
    response = client.post("/api/households", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def member(client, household_id: int, name: str) -> dict:
    response = client.post(f"/api/households/{household_id}/members", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def error_code(response) -> str:
    return response.json()["error"]["code"]
