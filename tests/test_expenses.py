"""Expenses API (US-03, US-04, US-05) against a real PostgreSQL."""

import pytest

from tests.api import error_code, household, member

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]


@pytest.fixture
def house(client) -> dict:
    """A household with three members: Tiến, Minh, Duy Anh (ids in that order)."""
    created = household(client)
    names = ("Tiến", "Minh", "Duy Anh")
    created["members"] = [member(client, created["id"], name) for name in names]
    return created


def ids(house) -> list[int]:
    return [m["id"] for m in house["members"]]


def body(house, **overrides) -> dict:
    tien, minh, anh = ids(house)
    return {
        "description": "Lẩu thứ sáu",
        "amount": 100_000,
        "payer_id": minh,
        "spent_at": "2026-10-23",
        "split": {"type": "equal", "member_ids": [tien, minh, anh]},
        **overrides,
    }


def create(client, house, **overrides):
    return client.post(f"/api/households/{house['id']}/expenses", json=body(house, **overrides))


# --- Create and read ----------------------------------------------------------------------


def test_equal_split_gives_the_leftover_dong_to_the_lowest_ids(client, house):
    response = create(client, house)
    assert response.status_code == 201, response.text
    expense = response.json()
    tien, minh, anh = ids(house)
    assert expense["shares"] == [
        {"member_id": tien, "amount": 33_334},
        {"member_id": minh, "amount": 33_333},
        {"member_id": anh, "amount": 33_333},
    ]
    assert expense["split_type"] == "equal"
    assert expense["source"] == "manual"
    assert expense["household_id"] == house["id"]
    assert set(expense) == {
        "id", "household_id", "description", "amount", "payer_id", "spent_at", "source",
        "created_at", "split_type", "shares",
    }


def test_custom_split(client, house):
    tien, minh, anh = ids(house)
    split = {"type": "custom", "shares": [
        {"member_id": tien, "amount": 60_000},
        {"member_id": anh, "amount": 40_000},
    ]}
    response = create(client, house, split=split, source="ai")
    assert response.status_code == 201, response.text
    expense = response.json()
    assert expense["split_type"] == "custom"
    assert expense["source"] == "ai"
    assert expense["shares"] == split["shares"]


def test_custom_shares_must_add_up_to_the_amount(client, house):
    tien, minh, _ = ids(house)
    split = {"type": "custom", "shares": [
        {"member_id": tien, "amount": 60_000},
        {"member_id": minh, "amount": 30_000},
    ]}
    response = create(client, house, split=split)
    assert response.status_code == 422
    assert error_code(response) == "split_mismatch"
    assert "90000" in response.json()["error"]["message"]


def test_get_one_expense(client, house):
    created = create(client, house).json()
    response = client.get(f"/api/expenses/{created['id']}")
    assert response.status_code == 200
    assert response.json() == created


def test_list_is_newest_first(client, house):
    older = create(client, house, spent_at="2026-10-01").json()
    newer = create(client, house, spent_at="2026-10-20").json()
    same_day_later = create(client, house, spent_at="2026-10-20").json()
    listed = client.get(f"/api/households/{house['id']}/expenses").json()
    assert [e["id"] for e in listed] == [same_day_later["id"], newer["id"], older["id"]]


def test_a_new_household_has_no_expenses(client):
    assert client.get(f"/api/households/{household(client)['id']}/expenses").json() == []


# --- Validation ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "overrides",
    [
        {"amount": 0},
        {"amount": -5000},
        {"amount": 1.5},
        {"amount": 10**13},
        {"description": "   "},
        {"description": "x" * 121},
        {"spent_at": "23/10/2026"},
        {"source": "magic"},
        {"split": {"type": "equal", "member_ids": []}},
        {"split": {"type": "custom", "shares": []}},
        {"split": {"type": "thirds"}},
    ],
)
def test_invalid_fields_are_422(client, house, overrides):
    response = create(client, house, **overrides)
    assert response.status_code == 422
    assert error_code(response) == "validation_error"


def test_payer_from_another_household_is_rejected(client, house):
    stranger = member(client, household(client, "Other")["id"], "Lan")
    response = create(client, house, payer_id=stranger["id"])
    assert response.status_code == 422
    assert error_code(response) == "unknown_member"


def test_participant_from_another_household_is_rejected(client, house):
    stranger = member(client, household(client, "Other")["id"], "Lan")
    split = {"type": "equal", "member_ids": [ids(house)[0], stranger["id"]]}
    response = create(client, house, split=split)
    assert response.status_code == 422
    assert error_code(response) == "unknown_member"


def test_a_member_twice_in_the_split_is_rejected(client, house):
    tien = ids(house)[0]
    response = create(client, house, split={"type": "equal", "member_ids": [tien, tien]})
    assert response.status_code == 422
    assert error_code(response) == "duplicate_member"


def test_unknown_household_is_404(client, house):
    response = client.post("/api/households/999999999/expenses", json=body(house))
    assert response.status_code == 404
    assert error_code(response) == "household_not_found"
    assert client.get("/api/households/999999999/expenses").status_code == 404


# --- Edit and delete (US-05) ----------------------------------------------------------------


def test_edit_replaces_the_expense_and_its_shares(client, house):
    created = create(client, house).json()
    tien, minh, anh = ids(house)
    change = body(house, description="Lẩu (sửa)", amount=90_000, payer_id=anh,
                  split={"type": "equal", "member_ids": [minh, anh]})
    response = client.put(f"/api/expenses/{created['id']}", json=change)
    assert response.status_code == 200, response.text
    edited = response.json()
    assert edited["id"] == created["id"]
    assert edited["created_at"] == created["created_at"]
    assert edited["description"] == "Lẩu (sửa)"
    assert (edited["amount"], edited["payer_id"]) == (90_000, anh)
    assert edited["shares"] == [
        {"member_id": minh, "amount": 45_000},
        {"member_id": anh, "amount": 45_000},
    ]
    assert client.get(f"/api/expenses/{created['id']}").json() == edited


def test_an_invalid_edit_changes_nothing(client, house):
    created = create(client, house).json()
    bad = body(house, split={"type": "custom", "shares": [{"member_id": ids(house)[0],
                                                           "amount": 1}]})
    assert client.put(f"/api/expenses/{created['id']}", json=bad).status_code == 422
    assert client.get(f"/api/expenses/{created['id']}").json() == created


def test_delete_expense(client, house):
    created = create(client, house).json()
    response = client.delete(f"/api/expenses/{created['id']}")
    assert response.status_code == 204
    assert client.get(f"/api/expenses/{created['id']}").status_code == 404
    # nobody is "in an expense" any more, so a member can now be removed
    assert client.delete(f"/api/members/{ids(house)[2]}").status_code == 204


@pytest.mark.parametrize("method", ["GET", "PUT", "DELETE"])
def test_unknown_expense_is_404(client, house, method):
    response = client.request(method, "/api/expenses/999999999", json=body(house))
    assert response.status_code == 404
    assert error_code(response) == "expense_not_found"


def test_members_in_an_expense_cannot_be_removed(client, house):
    create(client, house)
    response = client.delete(f"/api/members/{ids(house)[2]}")  # a participant, not the payer
    assert response.status_code == 409
    assert error_code(response) == "member_in_use"


def test_deleting_the_household_deletes_its_expenses(client, house):
    created = create(client, house).json()
    assert client.delete(f"/api/households/{house['id']}").status_code == 204
    assert client.get(f"/api/expenses/{created['id']}").status_code == 404
