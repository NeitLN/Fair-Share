"""GET /api/households/{id}/balances against a real PostgreSQL, built up through the API."""

import pytest

from tests.api import error_code, household, member

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]


@pytest.fixture
def house(client) -> dict:
    """Tiến, Minh, Duy Anh (ids in that order)."""
    created = household(client)
    created["ids"] = [member(client, created["id"], n)["id"] for n in ("Tiến", "Minh", "Duy Anh")]
    return created


def expense(client, house, payer: int, amount: int, participants: list[int]) -> dict:
    response = client.post(f"/api/households/{house['id']}/expenses", json={
        "description": "Chi tiêu", "amount": amount, "payer_id": payer, "spent_at": "2026-10-26",
        "split": {"type": "equal", "member_ids": participants},
    })
    assert response.status_code == 201, response.text
    return response.json()


def settle(client, house, payer: int, payee: int, amount: int) -> None:
    response = client.post(f"/api/households/{house['id']}/settlements", json={
        "from_member_id": payer, "to_member_id": payee, "amount": amount,
        "settled_at": "2026-10-27",
    })
    assert response.status_code == 201, response.text


def balances(client, house) -> dict:
    response = client.get(f"/api/households/{house['id']}/balances")
    assert response.status_code == 200, response.text
    return response.json()


def nets(result) -> dict[int, int]:
    return {b["member_id"]: b["net"] for b in result["balances"]}


def test_a_new_household_is_all_settled(client, house):
    result = balances(client, house)
    assert [b["name"] for b in result["balances"]] == ["Tiến", "Minh", "Duy Anh"]
    assert all(b["net"] == 0 for b in result["balances"])
    assert result["suggested"] == []


def test_one_dinner(client, house):
    tien, minh, anh = house["ids"]
    expense(client, house, payer=minh, amount=300_000, participants=[tien, minh, anh])
    result = balances(client, house)
    assert result["balances"][1] == {
        "member_id": minh, "name": "Minh",
        "paid": 300_000, "owed": 100_000, "sent": 0, "received": 0, "net": 200_000,
    }
    assert nets(result) == {tien: -100_000, minh: 200_000, anh: -100_000}
    assert result["suggested"] == [
        {"from_member_id": tien, "to_member_id": minh, "amount": 100_000},
        {"from_member_id": anh, "to_member_id": minh, "amount": 100_000},
    ]


def test_a_settlement_moves_the_balance(client, house):
    tien, minh, anh = house["ids"]
    expense(client, house, payer=minh, amount=300_000, participants=[tien, minh, anh])
    settle(client, house, tien, minh, 100_000)
    result = balances(client, house)
    assert nets(result) == {tien: 0, minh: 100_000, anh: -100_000}
    assert result["suggested"] == [{"from_member_id": anh, "to_member_id": minh, "amount": 100_000}]


def test_editing_and_deleting_an_expense_update_the_balances_at_once(client, house):
    tien, minh, anh = house["ids"]
    created = expense(client, house, payer=minh, amount=300_000, participants=[tien, minh, anh])
    client.put(f"/api/expenses/{created['id']}", json={
        "description": "Chi tiêu", "amount": 90_000, "payer_id": tien, "spent_at": "2026-10-26",
        "split": {"type": "equal", "member_ids": [tien, anh]},
    })
    assert nets(balances(client, house)) == {tien: 45_000, minh: 0, anh: -45_000}
    client.delete(f"/api/expenses/{created['id']}")
    assert set(nets(balances(client, house)).values()) == {0}


def test_paying_the_suggested_transfers_settles_everyone(client, house):
    tien, minh, anh = house["ids"]
    expense(client, house, payer=minh, amount=240_001, participants=[tien, minh, anh])
    expense(client, house, payer=anh, amount=450_000, participants=[tien, minh, anh])
    expense(client, house, payer=tien, amount=99_999, participants=[tien, anh])
    settle(client, house, tien, anh, 50_000)

    result = balances(client, house)
    assert sum(nets(result).values()) == 0
    assert len(result["suggested"]) <= 2  # n - 1 for 3 members
    for transfer in result["suggested"]:
        settle(client, house, transfer["from_member_id"], transfer["to_member_id"],
               transfer["amount"])

    after = balances(client, house)
    assert set(nets(after).values()) == {0}
    assert after["suggested"] == []


def test_other_households_do_not_count(client, house):
    other = household(client, "Other")
    lan, hoa = (member(client, other["id"], n)["id"] for n in ("Lan", "Hoa"))
    expense(client, other, payer=lan, amount=1_000_000, participants=[lan, hoa])
    assert set(nets(balances(client, house)).values()) == {0}


def test_unknown_household_is_404(client):
    response = client.get("/api/households/999999999/balances")
    assert response.status_code == 404
    assert error_code(response) == "household_not_found"
