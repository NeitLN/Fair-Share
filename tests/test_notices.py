"""Telling someone "Tôi đã chuyển" (docs/ACCOUNTS.md, S3): the one who owes tells the one paid.

A notice changes no balance. The receiver answers it: "Đã nhận" records the told amount (S2) and
removes the notice; "Chưa nhận được" leaves it on the payer's card as declined. Every answer names
the amount it saw, so an answer from an old screen never touches a notice told again since.
"""
import pytest

from tests.api import error_code, household, member
from tests.conftest import bearer
from tests.test_accounts import at_once

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]


@pytest.fixture
def house(client) -> dict:
    """Tiến (the owner) paid 300.000đ of rent for Tiến, Minh and Lan: both owe him 100.000đ."""
    h = household(client, "Nhà trọ Q7")
    tien = member(client, h["id"], "Tiến")["id"]
    minh = member(client, h["id"], "Minh")["id"]
    lan = member(client, h["id"], "Lan")["id"]
    client.post(
        f"/api/households/{h['id']}/expenses",
        json={"description": "Tiền nhà", "amount": 300000, "payer_id": tien,
              "spent_at": "2026-11-01",
              "split": {"type": "equal", "member_ids": [tien, minh, lan]}},
    )
    return {"id": h["id"], "tien": tien, "minh": minh, "lan": lan,
            "minh_token": client.member_tokens[minh], "lan_token": client.member_tokens[lan]}


def notices(client, h, token=None):
    headers = bearer(token) if token else {}
    return client.get(f"/api/households/{h}/notices", headers=headers).json()


def tell(client, house, to, amount=100000, token=None):
    return client.put(
        f"/api/households/{house['id']}/notices",
        json={"to_member_id": to, "amount": amount},
        headers=bearer(token or house["minh_token"]),
    )


def accept(client, house, sender, amount=100000, headers=None):
    """Tiến's "Đã nhận" on what `sender` told him."""
    return client.post(
        f"/api/households/{house['id']}/notices/{sender}/accept",
        json={"amount": amount, "settled_at": "2026-11-03"},
        headers=headers or {},
    )


def decline(client, house, sender, amount=100000, token=None):
    return client.post(
        f"/api/households/{house['id']}/notices/{sender}/decline",
        json={"amount": amount},
        headers=bearer(token) if token else {},
    )


def balances(client, h):
    rows = client.get(f"/api/households/{h}/balances").json()["balances"]
    return {row["member_id"]: row["net"] for row in rows}


def settlements(client, h):
    return client.get(f"/api/households/{h}/settlements").json()


def test_telling_the_receiver_changes_no_balance_and_everyone_sees_it(client, house):
    before = balances(client, house["id"])
    response = tell(client, house, house["tien"])
    assert response.status_code == 200, response.text
    assert response.json() | {"created_at": None} == {
        "from_member_id": house["minh"], "to_member_id": house["tien"], "amount": 100000,
        "status": "sent", "created_at": None,
    }
    assert balances(client, house["id"]) == before
    # The receiver, the payer and the others in the house all see it
    for token in (None, house["minh_token"], house["lan_token"]):
        assert [n["from_member_id"] for n in notices(client, house["id"], token)] == [house["minh"]]


def test_the_sender_is_always_the_signed_in_member(client, house):
    """There is no from_member_id to send: Lan cannot say Minh has paid."""
    tell(client, house, house["tien"], token=house["lan_token"])
    assert [n["from_member_id"] for n in notices(client, house["id"])] == [house["lan"]]


def test_nobody_tells_themselves(client, house):
    response = tell(client, house, house["minh"])
    assert response.status_code == 422
    assert error_code(response) == "same_member"


def test_a_name_from_another_household_is_refused(client, house):
    other = household(client, "Nhà khác")
    stranger = client.get(f"/api/households/{other['id']}/members").json()[0]["id"]
    response = tell(client, house, stranger)
    assert response.status_code == 422
    assert error_code(response) == "unknown_member"


@pytest.mark.parametrize(
    "to, amount",
    [("tien", 90000),  # not the suggested amount (it changed since the page loaded)
     ("lan", 100000)],  # Minh owes Lan nothing
)
def test_only_a_transfer_suggested_now_can_be_told(client, house, to, amount):
    response = tell(client, house, house[to], amount=amount)
    assert response.status_code == 409, response.text
    assert error_code(response) == "suggestion_changed"
    assert notices(client, house["id"]) == []


def test_received_records_the_told_amount_once(client, house):
    tell(client, house, house["tien"])
    first = accept(client, house, house["minh"])
    assert first.status_code == 201, first.text
    assert first.json()["amount"] == 100000
    assert first.json()["from_member_id"] == house["minh"]
    assert first.json()["to_member_id"] == house["tien"]
    assert notices(client, house["id"]) == []
    # Pressed again (another tab, a retry after a lost answer): nothing more is recorded
    again = accept(client, house, house["minh"])
    assert again.status_code == 409
    assert error_code(again) == "notice_changed"
    assert len(settlements(client, house["id"])) == 1


def test_received_at_the_same_moment_twice_records_it_once(make_client, client, house):
    tell(client, house, house["tien"])
    tien_token = client.member_tokens[house["tien"]]
    clients = [make_client() for _ in range(4)]
    answers = at_once(
        [lambda c=c: accept(c, house, house["minh"], headers=bearer(tien_token)).status_code
         for c in clients]
    )
    assert sorted(answers) == [201, 409, 409, 409]
    assert len(settlements(client, house["id"])) == 1


def test_an_answer_to_an_old_amount_changes_nothing(client, house):
    """Tiến's screen still shows Minh's 100.000đ, but an expense since made it 150.000đ and Minh
    told again."""
    tell(client, house, house["tien"])
    client.post(
        f"/api/households/{house['id']}/expenses",
        json={"description": "Tiền điện", "amount": 150000, "payer_id": house["tien"],
              "spent_at": "2026-11-02",
              "split": {"type": "equal", "member_ids": [house["tien"], house["minh"],
                                                        house["lan"]]}},
    )
    assert tell(client, house, house["tien"], amount=150000).status_code == 200
    for stale in (accept(client, house, house["minh"]), decline(client, house, house["minh"])):
        assert stale.status_code == 409
        assert error_code(stale) == "notice_changed"
    assert settlements(client, house["id"]) == []
    assert [(n["amount"], n["status"]) for n in notices(client, house["id"])] == [(150000, "sent")]


def test_only_the_receiver_can_answer(client, house):
    tell(client, house, house["tien"])
    for token in (house["minh_token"], house["lan_token"]):
        assert decline(client, house, house["minh"], token=token).status_code == 409
        response = accept(client, house, house["minh"], headers=bearer(token))
        assert response.status_code == 409, response.text
    assert notices(client, house["id"])[0]["status"] == "sent"
    assert settlements(client, house["id"]) == []


def test_recording_the_told_amount_by_hand_answers_the_notice(client, house):
    tell(client, house, house["tien"])
    tell(client, house, house["tien"], token=house["lan_token"])
    paid = client.post(  # Tiến, who received it, records Minh's repayment from "Ghi khoản trả khác"
        f"/api/households/{house['id']}/settlements",
        json={"from_member_id": house["minh"], "to_member_id": house["tien"], "amount": 100000,
              "settled_at": "2026-11-03"},
    )
    assert paid.status_code == 201, paid.text
    assert [n["from_member_id"] for n in notices(client, house["id"])] == [house["lan"]]


def test_another_repayment_leaves_the_notice_to_be_answered(client, house):
    """A separate 30.000đ in cash is not the 100.000đ Minh told about."""
    tell(client, house, house["tien"])
    paid = client.post(
        f"/api/households/{house['id']}/settlements",
        json={"from_member_id": house["minh"], "to_member_id": house["tien"], "amount": 30000,
              "settled_at": "2026-11-03"},
    )
    assert paid.status_code == 201, paid.text
    assert [(n["from_member_id"], n["amount"]) for n in notices(client, house["id"])] == [
        (house["minh"], 100000)
    ]


def test_not_received_shows_on_the_payers_card_until_they_tell_again(client, house):
    tell(client, house, house["tien"])
    declined = decline(client, house, house["minh"])
    assert declined.status_code == 200, declined.text
    assert declined.json()["status"] == "declined"
    assert notices(client, house["id"], house["minh_token"])[0]["status"] == "declined"
    # Declining twice, or "Đã nhận" on it: nothing is waiting any more
    for again in (decline(client, house, house["minh"]), accept(client, house, house["minh"])):
        assert again.status_code == 409
        assert error_code(again) == "notice_changed"
    # Telling again sends it again
    retold = tell(client, house, house["tien"])
    assert retold.json()["status"] == "sent"


def test_the_payer_takes_their_notice_back_and_nobody_else_can(client, house):
    tell(client, house, house["tien"])
    path = f"/api/households/{house['id']}/notices/{house['tien']}"
    assert client.delete(path, headers=bearer(house["lan_token"])).status_code == 204
    assert client.delete(path).status_code == 204  # the receiver has no notice of their own to it
    assert len(notices(client, house["id"])) == 1
    assert client.delete(path, headers=bearer(house["minh_token"])).status_code == 204
    assert notices(client, house["id"]) == []
