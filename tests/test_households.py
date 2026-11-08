"""Households and members API (US-01, US-02) against a real PostgreSQL.

Shapes and status codes are the ones the SPA expects (frontend/src/api/households.ts): 201 on
create, 204 on delete, {"error": {"code", "message"}} on failure. Who may do what is in
tests/test_access.py; joining and approving in tests/test_accounts.py.
"""
import psycopg
import pytest

from app.routers.households import MAX_MEMBERS
from tests.api import error_code, household, member, remove_access
from tests.conftest import bearer

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]


# --- Households (US-01) -----------------------------------------------------------------------


def test_create_then_get(client):
    created = household(client, "  Nhà trọ Q7  ")
    assert created["name"] == "Nhà trọ Q7"  # trimmed
    # The creator owns it, with a name of their own in the split; no key any more
    assert set(created) == {"id", "name", "created_at", "role", "member_id", "my_net", "waiting"}
    assert created["role"] == "owner"

    assert client.get(f"/api/households/{created['id']}").json() == created


def test_the_list_has_only_your_own_households(client):
    mine = household(client, "Nhà của mình")
    other = client.sign_up()
    client.post("/api/households", json={"name": "Nhà của nhóm khác"}, headers=bearer(other))

    listed = client.get("/api/households").json()
    assert [h["name"] for h in listed["households"]] == ["Nhà của mình"]
    assert listed["households"][0]["id"] == mine["id"]
    assert listed["pending"] == []


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
        ("GET", "/api/households/{id}/invite"),
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
    with psycopg.connect(db_url) as conn:
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
        for table in ("members", "household_users", "invite_codes"):
            sql = f"SELECT count(*) FROM {table} WHERE household_id = %s"
            assert conn.execute(sql, (created["id"],)).fetchone()[0] == 0


# --- Members (US-02) --------------------------------------------------------------------------


def test_list_members_in_order_with_their_role(client):
    house = household(client)
    tien = member(client, house["id"], "Tiến")  # the owner's own name
    minh = member(client, house["id"], " Minh ")
    assert minh["name"] == "Minh"
    assert minh["household_id"] == house["id"]
    assert set(minh) == {
        "id", "household_id", "name", "created_at", "role", "user_id", "status", "photo_version",
        "gender",
    }

    listed = client.get(f"/api/households/{house['id']}/members").json()
    assert [(m["name"], m["role"]) for m in listed] == [("Tiến", "owner"), ("Minh", "member")]
    assert listed[0] == tien


def test_a_new_household_has_only_its_owner(client):
    house = household(client)
    listed = client.get(f"/api/households/{house['id']}/members").json()
    assert [(m["id"], m["role"]) for m in listed] == [(house["member_id"], "owner")]


def test_a_new_person_cannot_take_a_name_already_used_ignoring_case(client):
    house = household(client)
    member(client, house["id"], "Minh")
    token = client.sign_up(display_name="MINH")
    code = client.get(f"/api/households/{house['id']}/invite").json()["code"]
    client.post("/api/join", json={"code": code}, headers=bearer(token))
    user_id = client.get("/api/auth/me", headers=bearer(token)).json()["id"]

    response = client.post(f"/api/households/{house['id']}/requests/{user_id}/approve", json={})
    assert response.status_code == 409
    assert error_code(response) == "member_name_taken"
    # The owner gives them another name instead
    approve = f"/api/households/{house['id']}/requests/{user_id}/approve"
    response = client.post(approve, json={"name": "Minh B"})
    assert response.status_code == 200
    assert response.json()["name"] == "Minh B"


def test_a_household_has_no_more_members_than_one_expense_can_be_split_between(client):
    """#134: the 51st member is refused with its own code, so "chia đều cả nhà" always works."""
    house = household(client)
    members_url = f"/api/households/{house['id']}/members"
    ids = [member(client, house["id"], f"Người {i}")["id"] for i in range(MAX_MEMBERS)]

    token = client.sign_up(display_name="Người thêm")
    code = client.get(f"/api/households/{house['id']}/invite").json()["code"]
    client.post("/api/join", json={"code": code}, headers=bearer(token))
    user_id = client.get("/api/auth/me", headers=bearer(token)).json()["id"]
    approve = f"/api/households/{house['id']}/requests/{user_id}/approve"
    response = client.post(approve, json={})
    assert response.status_code == 409
    assert error_code(response) == "too_many_members"
    assert len(client.get(members_url).json()) == MAX_MEMBERS

    # Someone leaves and their name goes: there is room for one again
    remove_access(client, house["id"], ids[-1])
    assert client.delete(f"/api/members/{ids.pop()}").status_code == 204
    added = client.post(approve, json={})
    assert added.status_code == 200
    ids.append(added.json()["id"])
    client.member_tokens[ids[-1]] = token

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
    response = client.patch(f"/api/members/{house['member_id']}", json={"name": name})
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


def test_remove_a_name_nobody_uses(client):
    house = household(client)
    member(client, house["id"], "Tiến")
    minh = member(client, house["id"], "Minh")
    remove_access(client, house["id"], minh["id"])
    response = client.delete(f"/api/members/{minh['id']}")
    assert response.status_code == 204
    names = [m["name"] for m in client.get(f"/api/households/{house['id']}/members").json()]
    assert names == ["Tiến"]


@pytest.mark.parametrize("method", ["PATCH", "DELETE"])
def test_unknown_member_is_404(client, method):
    response = client.request(method, "/api/members/999999999", json={"name": "Minh"})
    assert response.status_code == 404
    assert error_code(response) == "member_not_found"


def test_member_in_an_expense_cannot_be_removed(client, db_url):
    house = household(client)
    member(client, house["id"], "Tiến")
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
        remove_access(client, house["id"], person["id"])
        response = client.delete(f"/api/members/{person['id']}")
        assert response.status_code == 409
        assert error_code(response) == "member_in_use"
    assert len(client.get(f"/api/households/{house['id']}/members").json()) == 3


# --- What is going on in each house (US4, spec 012) -------------------------------------------


def listed(client, token: str | None = None) -> dict:
    response = client.get("/api/households", headers=bearer(token) if token else {})
    assert response.status_code == 200, response.text
    return response.json()


def card(client, household_id: int, token: str | None = None) -> dict:
    return next(h for h in listed(client, token)["households"] if h["id"] == household_id)


def net_for(client, household_id: int, member_id: int) -> int:
    rows = client.get(f"/api/households/{household_id}/balances").json()["balances"]
    return next(row["net"] for row in rows if row["member_id"] == member_id)


def add_expense(
    client, household_id: int, payer: int, amount: int, participants: list[int]
) -> None:
    response = client.post(
        f"/api/households/{household_id}/expenses",
        json={"description": "Chi tiêu", "amount": amount, "payer_id": payer,
              "spent_at": "2026-11-01", "split": {"type": "equal", "member_ids": participants}},
    )
    assert response.status_code == 201, response.text


def repay(client, household_id: int, payer: int, payee: int, amount: int) -> None:
    response = client.post(
        f"/api/households/{household_id}/settlements",
        json={"from_member_id": payer, "to_member_id": payee, "amount": amount,
              "settled_at": "2026-11-02"},
    )
    assert response.status_code == 201, response.text


def test_a_card_carries_the_callers_balance_from_the_same_numbers_as_the_house(client):
    """Credit, debt and settled all read the same as the house's own Tổng quan."""
    created = household(client)
    tien = member(client, created["id"], "Tiến")["id"]
    minh = member(client, created["id"], "Minh")["id"]

    assert card(client, created["id"])["my_net"] == net_for(client, created["id"], tien) == 0

    # Minh pays for both: Tiến owes his half
    add_expense(client, created["id"], minh, 300_000, [tien, minh])
    assert card(client, created["id"])["my_net"] == net_for(client, created["id"], tien) == -150_000

    # Tiến pays Minh back: settled
    repay(client, created["id"], tien, minh, 150_000)
    assert card(client, created["id"])["my_net"] == net_for(client, created["id"], tien) == 0

    # Tiến pays one for both: the house owes him
    add_expense(client, created["id"], tien, 400_000, [tien, minh])
    assert card(client, created["id"])["my_net"] == net_for(client, created["id"], tien) == 200_000


def pending_joiner(client, household_id: int, name: str) -> str:
    """An account asking to join, not approved: returns its token."""
    token = client.sign_up(display_name=name)
    code = client.get(f"/api/households/{household_id}/invite").json()["code"]
    response = client.post("/api/join", json={"code": code}, headers=bearer(token))
    assert response.status_code == 200, response.text
    return token


def test_waiting_counts_join_requests_for_the_owner_and_notices_sent_to_them(client):
    created = household(client)
    tien = member(client, created["id"], "Tiến")["id"]
    minh = member(client, created["id"], "Minh")["id"]
    pending_joiner(client, created["id"], "Lan")
    pending_joiner(client, created["id"], "Hoa")
    assert card(client, created["id"])["waiting"] == 2

    # Minh owes Tiến and says he sent it: one more thing waits for the owner's answer
    add_expense(client, created["id"], tien, 300_000, [tien, minh])
    told = client.put(
        f"/api/households/{created['id']}/notices",
        json={"to_member_id": tien, "amount": 150_000},
        headers=bearer(client.member_tokens[minh]),
    )
    assert told.status_code == 200, told.text
    assert card(client, created["id"])["waiting"] == 3

    # A declined notice waits for nobody
    declined = client.post(
        f"/api/households/{created['id']}/notices/{minh}/decline", json={"amount": 150_000}
    )
    assert declined.status_code == 200, declined.text
    assert card(client, created["id"])["waiting"] == 2


def test_a_member_waits_for_notices_but_never_for_other_peoples_join_requests(client):
    created = household(client)
    tien = member(client, created["id"], "Tiến")["id"]
    minh = member(client, created["id"], "Minh")["id"]
    minh_token = client.member_tokens[minh]
    pending_joiner(client, created["id"], "Lan")
    pending_joiner(client, created["id"], "Hoa")

    assert card(client, created["id"], minh_token)["waiting"] == 0

    # Tiến owes Minh and says he sent it: now one thing waits for Minh
    add_expense(client, created["id"], minh, 300_000, [tien, minh])
    told = client.put(
        f"/api/households/{created['id']}/notices",
        json={"to_member_id": minh, "amount": 150_000},
    )
    assert told.status_code == 200, told.text
    assert card(client, created["id"], minh_token)["waiting"] == 1
    assert card(client, created["id"])["waiting"] == 2  # the owner's two join requests only


def test_a_pending_request_carries_neither_the_balance_nor_the_waiting_count(client):
    created = household(client)
    token = pending_joiner(client, created["id"], "Lan")

    body = listed(client, token)
    assert body["households"] == []
    assert set(body["pending"][0]) == {"household_id", "requested_at"}
