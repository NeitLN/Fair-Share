"""Recurring expenses (specs/007-recurring-expenses) against a real PostgreSQL.

One expense per item per month of its date, held by the database on new expenses and on edits; an
item is made from a new expense and recorded from by a person, never by the app; it is stopped, not
deleted.
"""

import threading

import psycopg
import pytest

from tests.api import error_code, household, member
from tests.conftest import bearer

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]


@pytest.fixture
def house(client) -> dict:
    """Tiến (the client's account, owner), Minh, Duy Anh."""
    created = household(client)
    names = ("Tiến", "Minh", "Duy Anh")
    created["members"] = [member(client, created["id"], name) for name in names]
    return created


def ids(house) -> list[int]:
    return [m["id"] for m in house["members"]]


def body(house, **overrides) -> dict:
    tien, minh, anh = ids(house)
    return {
        "description": "Tiền nhà",
        "amount": 4_500_000,
        "payer_id": minh,
        "spent_at": "2026-11-05",
        "category": "rent",
        "split": {"type": "equal", "member_ids": [tien, minh, anh]},
        **overrides,
    }


def create(client, house, **overrides):
    return client.post(f"/api/households/{house['id']}/expenses", json=body(house, **overrides))


def items(client, house) -> list[dict]:
    response = client.get(f"/api/households/{house['id']}/recurring")
    assert response.status_code == 200, response.text
    return response.json()


def recurring(client, house, **overrides) -> tuple[dict, dict]:
    """A new expense made to recur: (the expense, the item)."""
    response = create(client, house, recurring={"varying_amount": False}, **overrides)
    assert response.status_code == 201, response.text
    expense = response.json()
    item = next(i for i in items(client, house) if i["id"] == expense["recurring_item_id"])
    return expense, item


def count_expenses(client, house) -> int:
    return len(client.get(f"/api/households/{house['id']}/expenses").json())


# --- Making an expense recur (US1) ---------------------------------------------------------


def test_a_ticked_expense_makes_an_item_and_is_its_first_record(client, house):
    expense, item = recurring(client, house)
    assert expense["recurring_item_id"] == item["id"]
    tien, minh, anh = ids(house)
    assert item == {
        "id": item["id"],
        "household_id": house["id"],
        "description": "Tiền nhà",
        "category": "rent",
        "payer_id": minh,
        "member_ids": [tien, minh, anh],
        "amount": 4_500_000,
        "day": 5,
        "created_by": item["created_by"],
        "created_at": item["created_at"],
    }
    assert item["created_by"] is not None


def test_a_varying_amount_is_not_kept(client, house):
    response = create(client, house, description="Tiền điện", recurring={"varying_amount": True})
    assert response.status_code == 201, response.text
    assert items(client, house)[0]["amount"] is None


def test_an_expense_without_the_tick_does_not_recur(client, house):
    response = create(client, house)
    assert response.json()["recurring_item_id"] is None
    assert items(client, house) == []


def test_a_custom_split_cannot_recur_and_nothing_is_saved(client, house):
    tien, minh, _ = ids(house)
    split = {"type": "custom", "shares": [{"member_id": tien, "amount": 3_000_000},
                                          {"member_id": minh, "amount": 1_500_000}]}
    response = create(client, house, split=split, recurring={"varying_amount": False})
    assert response.status_code == 422
    assert error_code(response) == "recurring_needs_equal_split"
    assert count_expenses(client, house) == 0
    assert items(client, house) == []


def test_both_fields_at_once_are_refused(client, house):
    _, item = recurring(client, house)
    response = create(client, house, spent_at="2026-12-05", recurring={"varying_amount": False},
                      recurring_item_id=item["id"])
    assert response.status_code == 422
    assert error_code(response) == "validation_error"


def test_at_most_20_active_items_and_a_stopped_one_does_not_count(client, house):
    made = [recurring(client, house, description=f"Khoản {n}")[1] for n in range(20)]
    response = create(client, house, description="Khoản 21", recurring={"varying_amount": False})
    assert response.status_code == 409
    assert error_code(response) == "too_many_recurring"
    assert count_expenses(client, house) == 20
    assert client.post(f"/api/recurring/{made[0]['id']}/stop").status_code == 204
    again = create(client, house, description="Khoản 21", recurring={"varying_amount": False})
    assert again.status_code == 201, again.text


# --- Recording from an item, once per month (US2) ------------------------------------------


def test_recording_from_an_item_once_per_month(client, house):
    _, item = recurring(client, house)
    december = create(client, house, spent_at="2026-12-01", recurring_item_id=item["id"])
    assert december.status_code == 201, december.text
    assert december.json()["recurring_item_id"] == item["id"]

    again = create(client, house, spent_at="2026-12-20", amount=10_000,
                   recurring_item_id=item["id"])
    assert again.status_code == 409
    assert error_code(again) == "recurring_month_taken"
    assert again.json()["error"]["details"] == {"expense_id": december.json()["id"]}
    assert count_expenses(client, house) == 2

    january = create(client, house, spent_at="2027-01-01", recurring_item_id=item["id"])
    assert january.status_code == 201


def test_any_member_records_from_an_item(client, house):
    _, item = recurring(client, house)
    anh = ids(house)[2]
    response = client.post(
        f"/api/households/{house['id']}/expenses",
        json=body(house, spent_at="2026-12-01", recurring_item_id=item["id"]),
        headers=bearer(client.member_tokens[anh]),
    )
    assert response.status_code == 201, response.text


def test_an_item_of_another_house_is_not_found(client, house):
    _, item = recurring(client, house)
    other = household(client, name="Nhà khác")
    owner = member(client, other["id"], "Tiến")
    response = client.post(f"/api/households/{other['id']}/expenses", json={
        **body(house, spent_at="2026-12-01", recurring_item_id=item["id"]),
        "payer_id": owner["id"], "split": {"type": "equal", "member_ids": [owner["id"]]},
    })
    assert response.status_code == 404
    assert error_code(response) == "recurring_not_found"


def test_a_stopped_item_is_refused_as_a_source(client, house):
    _, item = recurring(client, house)
    assert client.post(f"/api/recurring/{item['id']}/stop").status_code == 204
    response = create(client, house, spent_at="2026-12-01", recurring_item_id=item["id"])
    assert response.status_code == 409
    assert error_code(response) == "recurring_stopped"


# --- Consistency on edits and deletions (US3) ----------------------------------------------


def test_moving_a_record_into_a_recorded_month_is_refused_and_changes_nothing(client, house):
    november, item = recurring(client, house)
    december = create(client, house, spent_at="2026-12-01", recurring_item_id=item["id"]).json()
    moved = client.put(f"/api/expenses/{december['id']}", json=body(house, spent_at="2026-11-30"))
    assert moved.status_code == 409
    assert error_code(moved) == "recurring_month_taken"
    assert moved.json()["error"]["details"] == {"expense_id": november["id"]}
    assert client.get(f"/api/expenses/{december['id']}").json()["spent_at"] == "2026-12-01"


def test_moving_a_record_into_a_free_month_keeps_its_link_and_frees_the_old_one(client, house):
    november, item = recurring(client, house)
    edit = body(house, spent_at="2027-02-28")
    moved = client.put(f"/api/expenses/{november['id']}", json=edit)
    assert moved.status_code == 200, moved.text
    assert moved.json()["recurring_item_id"] == item["id"]
    # November is free again
    again = create(client, house, spent_at="2026-11-10", recurring_item_id=item["id"])
    assert again.status_code == 201


def test_an_edit_never_changes_the_link(client, house):
    expense, item = recurring(client, house)
    _, other = recurring(client, house, description="Internet", spent_at="2026-11-06")
    for sent in (None, other["id"]):
        edit = body(house, description="Tiền nhà tháng 11")
        if sent is not None:
            edit["recurring_item_id"] = sent
        response = client.put(f"/api/expenses/{expense['id']}", json=edit)
        assert response.status_code == 200, response.text
        assert response.json()["recurring_item_id"] == item["id"]


def test_deleting_a_record_frees_its_month(client, house):
    expense, item = recurring(client, house)
    assert client.delete(f"/api/expenses/{expense['id']}").status_code == 204
    assert create(client, house, recurring_item_id=item["id"]).status_code == 201


# --- Seeing and stopping (US4) -------------------------------------------------------------


def test_stopping_by_the_creator_or_the_owner_only(client, house):
    tien, minh, anh = ids(house)
    response = client.post(
        f"/api/households/{house['id']}/expenses",
        json=body(house, recurring={"varying_amount": False}),
        headers=bearer(client.member_tokens[minh]),
    )
    expense = response.json()
    item_id = expense["recurring_item_id"]
    stop = f"/api/recurring/{item_id}/stop"
    as_anh = client.post(stop, headers=bearer(client.member_tokens[anh]))
    assert as_anh.status_code == 403
    assert error_code(as_anh) == "forbidden"
    as_minh = client.post(stop, headers=bearer(client.member_tokens[minh]))
    assert as_minh.status_code == 204
    assert client.post(stop).status_code == 204  # twice: nothing changes
    assert items(client, house) == []
    # The history stays linked
    assert client.get(f"/api/expenses/{expense['id']}").json()["recurring_item_id"] == item_id


def test_strangers_get_not_found(client, house, make_client):
    _, item = recurring(client, house)
    stranger = make_client()
    assert stranger.get(f"/api/households/{house['id']}/recurring").status_code == 404
    response = stranger.post(f"/api/recurring/{item['id']}/stop")
    assert response.status_code == 404
    assert error_code(response) == "recurring_not_found"


def test_deleting_the_house_takes_its_items(client, house):
    recurring(client, house)
    assert client.delete(f"/api/households/{house['id']}").status_code == 204


def test_links_change_no_balance(client, house):
    _, item = recurring(client, house)
    create(client, house, spent_at="2026-12-01", recurring_item_id=item["id"])
    with_links = client.get(f"/api/households/{house['id']}/balances").json()
    create(client, house, spent_at="2026-11-05")
    create(client, house, spent_at="2026-12-01")
    # Same two amounts again without links: every net doubles, nothing else
    without = client.get(f"/api/households/{house['id']}/balances").json()
    assert [b["net"] * 2 for b in with_links["balances"]] == [b["net"] for b in without["balances"]]


# --- The rule itself, in the database ------------------------------------------------------


def test_two_connections_cannot_both_record_one_item_in_one_month(client, house, db_url):
    _, item = recurring(client, house)
    insert = (
        "INSERT INTO expenses (household_id, description, amount, payer_id, spent_at, source,"
        " recurring_item_id) VALUES (%s, 'Tiền nhà', 1, %s, %s, 'manual', %s)"
    )
    params = (house["id"], ids(house)[1], "2027-03-01", item["id"])
    first = psycopg.connect(db_url)
    second = psycopg.connect(db_url)
    try:
        first.execute(insert, params)  # not committed yet: the second one has to wait for it
        outcome: list[BaseException | None] = []

        def race():
            try:
                second.execute(insert, (*params[:2], "2027-03-31", params[3]))
                second.commit()
                outcome.append(None)
            except psycopg.Error as exc:
                second.rollback()
                outcome.append(exc)

        racer = threading.Thread(target=race)
        racer.start()
        racer.join(timeout=1)
        assert racer.is_alive(), "the second insert should wait on the first"
        first.commit()
        racer.join(timeout=10)
        assert isinstance(outcome[0], psycopg.errors.UniqueViolation)
    finally:
        first.close()
        second.close()
