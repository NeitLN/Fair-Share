"""Settlements API (US-08) against a real PostgreSQL."""

import pytest

from tests.api import error_code, household, member

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]


@pytest.fixture
def house(client) -> dict:
    """A household with two members: Tiến and Minh."""
    created = household(client)
    created["tien"] = member(client, created["id"], "Tiến")["id"]
    created["minh"] = member(client, created["id"], "Minh")["id"]
    return created


def pay(client, house, **overrides):
    body = {
        "from_member_id": house["minh"],
        "to_member_id": house["tien"],
        "amount": 120_000,
        "settled_at": "2026-10-25",
        **overrides,
    }
    return client.post(f"/api/households/{house['id']}/settlements", json=body)


def test_record_and_list_a_settlement(client, house):
    response = pay(client, house, note="  chuyển khoản  ")
    assert response.status_code == 201, response.text
    created = response.json()
    assert (created["from_member_id"], created["to_member_id"]) == (house["minh"], house["tien"])
    assert (created["amount"], created["settled_at"]) == (120_000, "2026-10-25")
    assert created["note"] == "chuyển khoản"
    assert set(created) == {
        "id", "household_id", "from_member_id", "to_member_id", "amount", "settled_at", "note",
        "created_at",
    }
    assert client.get(f"/api/households/{house['id']}/settlements").json() == [created]


@pytest.mark.parametrize("note", [None, "", "   "])
def test_no_note_is_stored_as_null(client, house, note):
    assert pay(client, house, note=note).json()["note"] is None


def test_list_is_newest_first(client, house):
    older = pay(client, house, settled_at="2026-10-01").json()
    newer = pay(client, house, settled_at="2026-10-20").json()
    same_day_later = pay(client, house, settled_at="2026-10-20").json()
    listed = client.get(f"/api/households/{house['id']}/settlements").json()
    assert [s["id"] for s in listed] == [same_day_later["id"], newer["id"], older["id"]]


def test_a_member_cannot_pay_themselves(client, house):
    response = pay(client, house, to_member_id=house["minh"])
    assert response.status_code == 422
    assert error_code(response) == "same_member"


@pytest.mark.parametrize(
    "overrides",
    [{"amount": 0}, {"amount": -1}, {"amount": 10**13}, {"settled_at": "hôm qua"},
     {"note": "x" * 201}],
)
def test_invalid_fields_are_422(client, house, overrides):
    response = pay(client, house, **overrides)
    assert response.status_code == 422
    assert error_code(response) == "validation_error"


@pytest.mark.parametrize("side", ["from_member_id", "to_member_id"])
def test_both_people_must_be_in_the_household(client, house, side):
    stranger = member(client, household(client, "Other")["id"], "Lan")["id"]
    response = pay(client, house, **{side: stranger})
    assert response.status_code == 422
    assert error_code(response) == "unknown_member"


def test_a_member_id_too_big_for_the_database_is_422(client, house):
    response = pay(client, house, to_member_id=2**70)
    assert response.status_code == 422


def test_unknown_household_is_404(client, house):
    response = client.post(
        "/api/households/999999999/settlements",
        json={"from_member_id": house["minh"], "to_member_id": house["tien"], "amount": 1,
              "settled_at": "2026-10-25"},
    )
    assert response.status_code == 404
    assert error_code(response) == "household_not_found"
    assert client.get("/api/households/999999999/settlements").status_code == 404


def test_delete_a_mistaken_settlement(client, house):
    created = pay(client, house).json()
    assert client.delete(f"/api/settlements/{created['id']}").status_code == 204
    assert client.get(f"/api/households/{house['id']}/settlements").json() == []


def test_unknown_settlement_is_404(client):
    response = client.delete("/api/settlements/999999999")
    assert response.status_code == 404
    assert error_code(response) == "settlement_not_found"


def test_members_in_a_settlement_cannot_be_removed(client, house):
    pay(client, house)
    for person in (house["minh"], house["tien"]):
        response = client.delete(f"/api/members/{person}")
        assert response.status_code == 409
        assert error_code(response) == "member_in_use"


def test_deleting_the_household_deletes_its_settlements(client, house):
    pay(client, house)
    assert client.delete(f"/api/households/{house['id']}").status_code == 204
