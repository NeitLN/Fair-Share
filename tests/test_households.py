"""Households and members API (US-01, US-02) against a real PostgreSQL.

Shapes and status codes are the ones the SPA expects (frontend/src/api/households.ts): 201 on
create, 204 on delete, {"error": {"code", "message"}} on failure.
"""
import psycopg
import pytest

from app.routers.households import MAX_MEMBERS
from tests.api import error_code, household, member

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]


# --- Households (US-01) -----------------------------------------------------------------------


def test_create_then_get(client):
    created = household(client, "  Nhà trọ Q7  ")
    assert created["name"] == "Nhà trọ Q7"  # trimmed
    # The key comes with the answer to creating it, and only there (#132)
    assert set(created) == {"id", "name", "created_at", "key"}
    key = created.pop("key")
    assert len(key) >= 32

    assert client.get(f"/api/households/{created['id']}").json() == created


def test_there_is_no_list_of_every_household(client):
    """#132: with no logins, such a list would show every group's households to anyone."""
    household(client, "Nhà của nhóm khác")
    response = client.get("/api/households")
    assert response.status_code == 405
    assert error_code(response) == "method_not_allowed"
    assert "Nhà của nhóm khác" not in response.text


@pytest.mark.parametrize("name", ["", "   ", "x" * 61])
def test_household_name_must_be_1_to_60_characters(client, name):
    response = client.post("/api/households", json={"name": name})
    assert response.status_code == 422
    assert error_code(response) == "validation_error"
    assert response.json()["error"]["details"][0]["loc"] == ["body", "name"]


def test_60_characters_is_fine(client):
    assert household(client, "x" * 60)["name"] == "x" * 60


def test_rename_household(client):
    created = household(client)
    response = client.patch(f"/api/households/{created['id']}", json={"name": "Nhà mới"})
    assert response.status_code == 200
    assert response.json()["name"] == "Nhà mới"


@pytest.mark.parametrize(
    "method, path",
    [
        ("GET", "/api/households/{id}"),
        ("PATCH", "/api/households/{id}"),
        ("DELETE", "/api/households/{id}"),
        ("GET", "/api/households/{id}/members"),
        ("POST", "/api/households/{id}/members"),
    ],
)
def test_unknown_household_is_404(client, method, path):
    response = client.request(method, path.format(id=999_999_999), json={"name": "Minh"})
    assert response.status_code == 404
    assert error_code(response) == "household_not_found"


@pytest.mark.parametrize("bad_id", ["0", "-1", "abc", str(2**63)])
def test_impossible_ids_are_422_not_500(client, bad_id):
    response = client.get(f"/api/households/{bad_id}")
    assert response.status_code == 422


def test_delete_household_removes_its_members_and_expenses(client, db_url):
    created = household(client)
    minh = member(client, created["id"], "Minh")
    anh = member(client, created["id"], "Duy Anh")
    with psycopg.connect(db_url) as conn:  # no expenses API yet (T-15): insert one directly
        expense = conn.execute(
            "INSERT INTO expenses (household_id, description, amount, payer_id)"
            " VALUES (%s, 'Dinner', 90000, %s) RETURNING id",
            (created["id"], minh["id"]),
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO expense_shares (expense_id, member_id, share_amount)"
            " VALUES (%s, %s, 45000), (%s, %s, 45000)",
            (expense, minh["id"], expense, anh["id"]),
        )

    response = client.delete(f"/api/households/{created['id']}")
    assert response.status_code == 204
    assert response.content == b""
    assert client.get(f"/api/households/{created['id']}").status_code == 404
    with psycopg.connect(db_url) as conn:
        sql = "SELECT count(*) FROM members WHERE household_id = %s"
        assert conn.execute(sql, (created["id"],)).fetchone()[0] == 0


# --- Members (US-02) --------------------------------------------------------------------------


def test_add_and_list_members_in_order(client):
    house = household(client)
    tien = member(client, house["id"], "Tiến")
    minh = member(client, house["id"], " Minh ")
    assert minh["name"] == "Minh"
    assert minh["household_id"] == house["id"]
    assert set(minh) == {"id", "household_id", "name", "created_at"}

    listed = client.get(f"/api/households/{house['id']}/members").json()
    assert [m["name"] for m in listed] == ["Tiến", "Minh"]  # oldest first
    assert listed[0] == tien


def test_a_new_household_has_no_members(client):
    house = household(client)
    assert client.get(f"/api/households/{house['id']}/members").json() == []


def test_duplicate_member_name_is_409_ignoring_case(client):
    house = household(client)
    member(client, house["id"], "Minh")
    response = client.post(f"/api/households/{house['id']}/members", json={"name": "MINH"})
    assert response.status_code == 409
    assert error_code(response) == "member_name_taken"


def test_a_household_has_no_more_members_than_one_expense_can_be_split_between(client):
    """#134: the 51st member is refused with its own code, so "chia đều cả nhà" always works."""
    house = household(client)
    members_url = f"/api/households/{house['id']}/members"
    ids = [member(client, house["id"], f"Người {i}")["id"] for i in range(MAX_MEMBERS)]

    response = client.post(members_url, json={"name": "Người thêm"})
    assert response.status_code == 409
    assert error_code(response) == "too_many_members"
    assert len(client.get(members_url).json()) == MAX_MEMBERS

    # Someone leaves: there is room for one again
    assert client.delete(f"/api/members/{ids.pop()}").status_code == 204
    ids.append(member(client, house["id"], "Người thêm")["id"])

    # And the whole household can share one expense equally
    response = client.post(
        f"/api/households/{house['id']}/expenses",
        json={"description": "Tiền nhà", "amount": 5_000_000, "payer_id": ids[0],
              "spent_at": "2026-10-29", "split": {"type": "equal", "member_ids": ids}},
    )
    assert response.status_code == 201
    assert len(response.json()["shares"]) == MAX_MEMBERS


def test_the_same_name_in_two_households_is_fine(client):
    member(client, household(client, "A")["id"], "Minh")
    member(client, household(client, "B")["id"], "Minh")


@pytest.mark.parametrize("name", ["", "  ", "x" * 41])
def test_member_name_must_be_1_to_40_characters(client, name):
    house = household(client)
    response = client.post(f"/api/households/{house['id']}/members", json={"name": name})
    assert response.status_code == 422


def test_rename_member(client):
    house = household(client)
    minh = member(client, house["id"], "minh")
    response = client.patch(f"/api/members/{minh['id']}", json={"name": "Minh"})
    assert response.status_code == 200  # changing only the case of your own name is fine
    assert response.json() == {**minh, "name": "Minh"}


def test_rename_member_to_a_taken_name_is_409(client):
    house = household(client)
    member(client, house["id"], "Tiến")
    minh = member(client, house["id"], "Minh")
    response = client.patch(f"/api/members/{minh['id']}", json={"name": "tiến"})
    assert response.status_code == 409
    assert error_code(response) == "member_name_taken"


def test_remove_member(client):
    house = household(client)
    minh = member(client, house["id"], "Minh")
    response = client.delete(f"/api/members/{minh['id']}")
    assert response.status_code == 204
    assert client.get(f"/api/households/{house['id']}/members").json() == []


@pytest.mark.parametrize("method", ["PATCH", "DELETE"])
def test_unknown_member_is_404(client, method):
    response = client.request(method, "/api/members/999999999", json={"name": "Minh"})
    assert response.status_code == 404
    assert error_code(response) == "member_not_found"


def test_member_in_an_expense_cannot_be_removed(client, db_url):
    house = household(client)
    minh = member(client, house["id"], "Minh")
    anh = member(client, house["id"], "Duy Anh")
    with psycopg.connect(db_url) as conn:
        expense = conn.execute(
            "INSERT INTO expenses (household_id, description, amount, payer_id)"
            " VALUES (%s, 'Dinner', 90000, %s) RETURNING id",
            (house["id"], minh["id"]),
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO expense_shares (expense_id, member_id, share_amount)"
            " VALUES (%s, %s, 90000)",
            (expense, anh["id"]),
        )

    for person in (minh, anh):  # the payer, and someone who only shares it
        response = client.delete(f"/api/members/{person['id']}")
        assert response.status_code == 409
        assert error_code(response) == "member_in_use"
    assert len(client.get(f"/api/households/{house['id']}/members").json()) == 2
