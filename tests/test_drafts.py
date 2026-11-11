"""No double save (specs/020-no-double-save): a draft records once, however often it is pressed.

The page sends a draft identity with every press of one expense form, repayment form or transfer
card. A press whose answer was lost, pressed again, gets the record it already made back (200);
the same identity saying something else records nothing (409 draft_already_saved); a deleted record
takes its identity with it. A request without one behaves as before.
"""
import threading
import time
import uuid

import psycopg
import pytest

from app.schemas import ExpenseIn, SettlementIn
from app.services.drafts import expense_fingerprint, settlement_fingerprint
from tests.api import error_code, household, member, remove_access
from tests.conftest import bearer

# --- The fingerprint (FR-006): no database ------------------------------------------------------


def expense_in(**changes) -> ExpenseIn:
    body = {"description": "Đi chợ", "amount": 347500, "payer_id": 1, "spent_at": "2026-11-12",
            "split": {"type": "equal", "member_ids": [1, 2, 3]}} | changes
    return ExpenseIn.model_validate(body)


def settlement_in(**changes) -> SettlementIn:
    body = {"from_member_id": 2, "to_member_id": 1, "amount": 50000,
            "settled_at": "2026-11-12"} | changes
    return SettlementIn.model_validate(body)


def test_a_pure_retry_has_the_same_expense_fingerprint():
    first = expense_fingerprint(expense_in())
    reordered = expense_in(split={"type": "equal", "member_ids": [3, 1, 2]})
    assert expense_fingerprint(reordered) == first
    assert expense_fingerprint(expense_in(description="  Đi chợ ")) == first
    assert expense_fingerprint(expense_in(source="ai")) == first
    assert expense_fingerprint(expense_in(category="other")) == first  # the default, sent


@pytest.mark.parametrize("change", [
    {"amount": 347501},
    {"payer_id": 2},
    {"spent_at": "2026-11-13"},
    {"description": "Đi chợ sáng"},
    {"category": "food"},
    {"split": {"type": "equal", "member_ids": [1, 2]}},
    {"split": {"type": "custom", "shares": [{"member_id": 1, "amount": 347500}]}},
    {"recurring": {}},
    {"recurring": {"varying_amount": True}},
    {"recurring_item_id": 7},
])
def test_any_real_change_gives_another_expense_fingerprint(change):
    assert expense_fingerprint(expense_in(**change)) != expense_fingerprint(expense_in())


def test_custom_shares_compare_by_member_not_by_order():
    one = expense_in(amount=3, split={"type": "custom", "shares": [
        {"member_id": 1, "amount": 1}, {"member_id": 2, "amount": 2}]})
    two = expense_in(amount=3, split={"type": "custom", "shares": [
        {"member_id": 2, "amount": 2}, {"member_id": 1, "amount": 1}]})
    assert expense_fingerprint(one) == expense_fingerprint(two)


def test_a_repayment_fingerprint_leaves_out_the_told_money_and_a_blank_note():
    first = settlement_fingerprint(settlement_in())
    assert settlement_fingerprint(settlement_in(note="")) == first
    assert settlement_fingerprint(settlement_in(note="   ")) == first
    assert settlement_fingerprint(settlement_in(notice={"version": 42})) == first
    assert settlement_fingerprint(settlement_in(note="tiền chợ")) != first
    assert settlement_fingerprint(settlement_in(amount=50001)) != first
    assert settlement_fingerprint(settlement_in(settled_at="2026-11-13")) != first


def test_a_card_leaves_the_day_out():
    """A retry across midnight is the same press of the card (FR-006, S3)."""
    today = settlement_fingerprint(settlement_in(draft_kind="card"))
    tomorrow = settlement_fingerprint(settlement_in(draft_kind="card", settled_at="2026-11-13"))
    assert today == tomorrow
    assert settlement_fingerprint(settlement_in(draft_kind="card", amount=1)) != today


@pytest.mark.parametrize("draft_id", ["abc", "", 123, str(uuid.uuid1())])
def test_only_a_version_4_uuid_is_an_identity(draft_id):
    with pytest.raises(ValueError):
        expense_in(draft_id=draft_id)


# --- Expenses (US1) ------------------------------------------------------------------------------


@pytest.fixture
def house(client, cleanup) -> dict:
    """Tiến (the owner), Minh and Lan, nothing spent yet."""
    h = household(client, "Nhà trọ Q7")
    tien = member(client, h["id"], "Tiến")["id"]
    minh = member(client, h["id"], "Minh")["id"]
    lan = member(client, h["id"], "Lan")["id"]
    return {"id": h["id"], "tien": tien, "minh": minh, "lan": lan,
            "minh_token": client.member_tokens[minh], "lan_token": client.member_tokens[lan]}


def new_draft() -> str:
    return str(uuid.uuid4())


def expense_body(house, draft_id=None, **changes) -> dict:
    body = {"description": "Đi chợ", "amount": 347500, "payer_id": house["tien"],
            "spent_at": "2026-11-12",
            "split": {"type": "equal",
                      "member_ids": [house["tien"], house["minh"], house["lan"]]}} | changes
    if draft_id is not None:
        body["draft_id"] = draft_id
    return body


def save(client, house, body, token=None):
    headers = bearer(token) if token else {}
    return client.post(f"/api/households/{house['id']}/expenses", json=body, headers=headers)


def expenses(client, house):
    return client.get(f"/api/households/{house['id']}/expenses").json()


def balances(client, house):
    rows = client.get(f"/api/households/{house['id']}/balances").json()["balances"]
    return {row["member_id"]: row["net"] for row in rows}


@pytest.mark.db
def test_pressing_again_gets_the_expense_back_and_records_nothing(client, house):
    body = expense_body(house, new_draft())
    first = save(client, house, body)
    assert first.status_code == 201, first.text
    after_first = balances(client, house)
    again = save(client, house, body)
    assert again.status_code == 200, again.text
    assert again.json() == first.json()
    assert len(expenses(client, house)) == 1
    assert balances(client, house) == after_first


@pytest.mark.db
def test_pressing_again_with_other_content_changes_nothing(client, house):
    draft = new_draft()
    first = save(client, house, expense_body(house, draft)).json()
    changed = save(client, house, expense_body(house, draft, amount=400000))
    assert changed.status_code == 409
    assert error_code(changed) == "draft_already_saved"
    assert changed.json()["error"]["details"] == {"kind": "expense", "id": first["id"]}
    assert [e["amount"] for e in expenses(client, house)] == [347500]
    # "Ghi thành khoản mới": a new draft records it
    assert save(client, house, expense_body(house, new_draft(), amount=400000)).status_code == 201
    assert len(expenses(client, house)) == 2


@pytest.mark.db
def test_the_same_values_in_a_new_draft_are_a_second_expense(client, house):
    """"Đi chợ" twice in one day is allowed (US1, scenario 6), and so is an old page."""
    assert save(client, house, expense_body(house, new_draft())).status_code == 201
    assert save(client, house, expense_body(house, new_draft())).status_code == 201
    assert save(client, house, expense_body(house)).status_code == 201
    assert save(client, house, expense_body(house)).status_code == 201
    assert len(expenses(client, house)) == 4


@pytest.mark.db
def test_a_repeat_of_the_recurring_tick_makes_no_second_item(client, house):
    body = expense_body(house, new_draft(), description="Tiền nhà", recurring={})
    first = save(client, house, body)
    assert first.status_code == 201, first.text
    again = save(client, house, body)
    assert again.status_code == 200, again.text
    assert again.json()["recurring_item_id"] == first.json()["recurring_item_id"]
    items = client.get(f"/api/households/{house['id']}/recurring").json()
    assert len(items) == 1
    assert len(expenses(client, house)) == 1


@pytest.mark.db
def test_a_repeat_of_ghi_ky_nay_is_not_month_taken(client, house):
    item = save(client, house, expense_body(house, description="Tiền nhà", recurring={},
                                            spent_at="2026-10-05")).json()["recurring_item_id"]
    body = expense_body(house, new_draft(), description="Tiền nhà", spent_at="2026-11-05",
                        recurring_item_id=item)
    first = save(client, house, body)
    assert first.status_code == 201, first.text
    again = save(client, house, body)
    assert again.status_code == 200, again.text
    assert again.json()["id"] == first.json()["id"]
    # Another draft for that month is still refused
    other = save(client, house, expense_body(house, new_draft(), description="Tiền nhà",
                                             spent_at="2026-11-06", recurring_item_id=item))
    assert error_code(other) == "recurring_month_taken"


@pytest.mark.db
def test_a_repeat_after_the_owner_edited_it_gets_it_as_it_is_now(client, house):
    """The fingerprint is the first request's, not the row's (spec, edge cases)."""
    body = expense_body(house, new_draft(), payer_id=house["minh"])
    first = save(client, house, body, token=house["minh_token"]).json()
    edited = client.put(f"/api/expenses/{first['id']}",
                        json=expense_body(house, payer_id=house["minh"], amount=300000))
    assert edited.status_code == 200, edited.text
    again = save(client, house, body, token=house["minh_token"])
    assert again.status_code == 200, again.text
    assert again.json()["amount"] == 300000
    assert len(expenses(client, house)) == 1


@pytest.mark.db
def test_a_repeat_after_a_member_lost_their_access_still_gets_it_back(client, house):
    """Nobody without an account can be in a new expense: a first save would be refused now, a
    repeat is not (FR-003, the lookup comes first)."""
    body = expense_body(house, new_draft())
    first = save(client, house, body).json()
    remove_access(client, house["id"], house["lan"])
    assert error_code(save(client, house, expense_body(house, new_draft()))) == \
        "member_without_account"
    again = save(client, house, body)
    assert again.status_code == 200, again.text
    assert again.json()["id"] == first["id"]


@pytest.mark.db
def test_a_deleted_expense_takes_its_identity_with_it(client, house):
    body = expense_body(house, new_draft())
    first = save(client, house, body).json()
    assert client.delete(f"/api/expenses/{first['id']}").status_code == 204
    again = save(client, house, body)
    assert again.status_code == 201, again.text
    assert again.json()["id"] != first["id"]
    assert len(expenses(client, house)) == 1


@pytest.mark.db
def test_identities_belong_to_one_account(client, house):
    """Minh's press with Tiến's identity is his own draft: it never returns Tiến's record."""
    draft = new_draft()
    assert save(client, house, expense_body(house, draft)).status_code == 201
    minh = save(client, house, expense_body(house, draft), token=house["minh_token"])
    assert minh.status_code == 201, minh.text
    assert len(expenses(client, house)) == 2


@pytest.mark.db
def test_a_malformed_identity_is_refused(client, house):
    response = save(client, house, expense_body(house, "not-a-uuid"))
    assert response.status_code == 422
    assert expenses(client, house) == []


@pytest.mark.db
def test_a_first_press_that_was_refused_leaves_the_identity_free(client, house):
    """A repeat whose first save left no record runs every check, like a first save."""
    draft = new_draft()
    refused = save(client, house, expense_body(house, draft, payer_id=999999999))
    assert error_code(refused) == "unknown_member"
    assert save(client, house, expense_body(house, draft)).status_code == 201


# --- Repayments typed in by hand (US2) and on a card (US3) ---------------------------------------


@pytest.fixture
def debt(client, house) -> dict:
    """Tiến paid 300.000đ for the three of them: Minh and Lan owe him 100.000đ each."""
    response = save(client, house, expense_body(house, description="Tiền nhà", amount=300000))
    assert response.status_code == 201, response.text
    return house


def repayment(house, draft_id=None, **changes) -> dict:
    body = {"from_member_id": house["minh"], "to_member_id": house["tien"], "amount": 50000,
            "settled_at": "2026-11-12"} | changes
    if draft_id is not None:
        body["draft_id"] = draft_id
    return body


def record(client, house, body):
    return client.post(f"/api/households/{house['id']}/settlements", json=body)


def settlements(client, house):
    return client.get(f"/api/households/{house['id']}/settlements").json()


def notices(client, house):
    return client.get(f"/api/households/{house['id']}/notices").json()


def tell(client, house, amount=100000):
    version = next((n["version"] for n in notices(client, house)
                    if n["from_member_id"] == house["minh"]), None)
    response = client.put(
        f"/api/households/{house['id']}/notices",
        json={"to_member_id": house["tien"], "amount": amount, "version": version},
        headers=bearer(house["minh_token"]),
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.db
def test_pressing_a_repayment_again_records_it_once(client, debt):
    body = repayment(debt, new_draft())
    first = record(client, debt, body)
    assert first.status_code == 201, first.text
    assert first.json()["draft_id"] == body["draft_id"]
    after_first = balances(client, debt)
    again = record(client, debt, body)
    assert again.status_code == 200, again.text
    assert again.json() == first.json()
    assert len(settlements(client, debt)) == 1
    assert balances(client, debt) == after_first


@pytest.mark.db
def test_a_repeat_of_told_money_takes_it_once_though_the_notice_changed(client, debt):
    """The first press took 60.000đ out of the 100.000đ told, which gave the notice a new version;
    the repeat names the old one, and still gets the repayment back (US2, scenario 1)."""
    told = tell(client, debt)
    body = repayment(debt, new_draft(), amount=60000, notice={"version": told["version"]})
    first = record(client, debt, body)
    assert first.status_code == 201, first.text
    left = notices(client, debt)
    assert [n["amount"] for n in left] == [40000]
    again = record(client, debt, body)
    assert again.status_code == 200, again.text
    assert again.json()["id"] == first.json()["id"]
    assert notices(client, debt) == left
    assert len(settlements(client, debt)) == 1


@pytest.mark.db
def test_a_changed_repayment_records_nothing(client, debt):
    draft = new_draft()
    first = record(client, debt, repayment(debt, draft)).json()
    changed = record(client, debt, repayment(debt, draft, amount=70000))
    assert changed.status_code == 409
    assert changed.json()["error"]["details"] == {"kind": "settlement", "id": first["id"]}
    assert len(settlements(client, debt)) == 1


@pytest.mark.db
def test_told_money_given_back_by_a_deletion_is_taken_again_once(client, debt):
    """US2, scenario 3: deleting the repayment put the 100.000đ back into the notice (spec 019),
    so the same draft pressed again (from a screen that read the house again) records it once."""
    told = tell(client, debt)
    draft = new_draft()
    first = record(client, debt, repayment(debt, draft, amount=100000,
                                           notice={"version": told["version"]})).json()
    assert notices(client, debt) == []
    assert client.delete(f"/api/settlements/{first['id']}").status_code == 204
    back = notices(client, debt)
    assert [n["amount"] for n in back] == [100000]
    again = record(client, debt, repayment(debt, draft, amount=100000,
                                           notice={"version": back[0]["version"]}))
    assert again.status_code == 201, again.text
    assert notices(client, debt) == []
    assert len(settlements(client, debt)) == 1


@pytest.mark.db
def test_a_card_press_repeated_the_next_day_is_the_same_press(client, debt):
    draft = new_draft()
    card = repayment(debt, draft, amount=100000, draft_kind="card")
    first = record(client, debt, card)
    assert first.status_code == 201, first.text
    again = record(client, debt, card | {"settled_at": "2026-11-13"})
    assert again.status_code == 200, again.text
    assert again.json()["id"] == first.json()["id"]
    # A form compares the day
    form_draft = new_draft()
    assert record(client, debt, repayment(debt, form_draft)).status_code == 201
    moved = record(client, debt, repayment(debt, form_draft, settled_at="2026-11-13"))
    assert error_code(moved) == "draft_already_saved"


@pytest.mark.db
def test_a_repayment_without_an_identity_is_recorded_as_before(client, debt):
    assert record(client, debt, repayment(debt)).status_code == 201
    assert record(client, debt, repayment(debt)).status_code == 201
    assert len(settlements(client, debt)) == 2
    assert all(s["draft_id"] is None for s in settlements(client, debt))


# --- Two presses at the same moment (SC-002) -----------------------------------------------------


def held_together(db_url, house_id, calls) -> list[int]:
    """Runs the calls while the house is held, so all of them are inside their transactions and
    waiting on the same lock when it is let go; returns their status codes."""
    answers: list[int] = []
    blocker = psycopg.connect(db_url)
    try:
        blocker.execute("SELECT 1 FROM households WHERE id = %s FOR UPDATE", (house_id,))
        workers = [threading.Thread(target=lambda call=call: answers.append(call().status_code))
                   for call in calls]
        for worker in workers:
            worker.start()
        time.sleep(0.8)
        assert answers == []  # all waiting on the house
        blocker.rollback()
        for worker in workers:
            worker.join(timeout=15)
    finally:
        blocker.close()
    return sorted(answers)


@pytest.mark.db
@pytest.mark.parametrize("kind", ["plain", "tick", "month"])
def test_two_presses_of_one_draft_at_once_record_one_expense(make_client, client, house, db_url,
                                                             kind):
    changes = {}
    if kind == "tick":
        changes = {"description": "Tiền nhà", "recurring": {}}
    elif kind == "month":
        item = save(client, house, expense_body(house, description="Tiền nhà", recurring={},
                                                spent_at="2026-10-05")).json()
        changes = {"description": "Tiền nhà", "recurring_item_id": item["recurring_item_id"]}
    body = expense_body(house, new_draft(), **changes)
    token = client.token
    one, two = make_client(), make_client()
    answers = held_together(db_url, house["id"], [
        lambda c=c: c.post(f"/api/households/{house['id']}/expenses", json=body,
                           headers=bearer(token))
        for c in (one, two)
    ])
    assert answers == [200, 201]
    drafted = [e for e in expenses(client, house) if e["spent_at"] == "2026-11-12"]
    assert len(drafted) == 1
    if kind == "tick":
        assert len(client.get(f"/api/households/{house['id']}/recurring").json()) == 1


@pytest.mark.db
def test_two_recurring_ticks_at_once_do_not_deadlock(make_client, client, house, db_url):
    """Two different saves that each make a recurring item: each used to hold the house shared and
    then wait to update it, for each other (research R5). Both are recorded now."""
    token = client.token
    bodies = [expense_body(house, new_draft(), description=name, recurring={})
              for name in ("Tiền nhà", "Internet")]
    pairs = [(make_client(), b) for b in bodies]
    answers = held_together(db_url, house["id"], [
        lambda c=c, b=b: c.post(f"/api/households/{house['id']}/expenses", json=b,
                                headers=bearer(token))
        for c, b in pairs
    ])
    assert answers == [201, 201]
    assert len(client.get(f"/api/households/{house['id']}/recurring").json()) == 2


@pytest.mark.db
def test_two_presses_of_told_money_at_once_take_it_once(make_client, client, debt, db_url):
    """Neither gets notice_changed from its twin: the second waits for the first, then finds it."""
    told = tell(client, debt)
    body = repayment(debt, new_draft(), amount=100000, notice={"version": told["version"]})
    token = client.member_tokens[debt["tien"]]
    answers = held_together(db_url, debt["id"], [
        lambda c=c: c.post(f"/api/households/{debt['id']}/settlements", json=body,
                           headers=bearer(token))
        for c in (make_client(), make_client())
    ])
    assert answers == [200, 201]
    assert len(settlements(client, debt)) == 1
    assert notices(client, debt) == []
