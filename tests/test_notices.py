"""Telling someone "Tôi đã chuyển" (docs/ACCOUNTS.md, S3): the one who owes tells the one paid.

A notice changes no balance. The receiver answers it: "Đã nhận" records the repayment (S2), which
removes the notice; "Chưa nhận được" leaves it on the payer's card as declined.
"""
import pytest

from tests.api import error_code, household, member
from tests.conftest import bearer

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]


@pytest.fixture
def house(client) -> dict:
    """Tiến (the owner) paid 300.000đ of rent for Tiến, Minh and Lan: Minh and Lan owe him."""
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


def balances(client, h):
    rows = client.get(f"/api/households/{h}/balances").json()["balances"]
    return {row["member_id"]: row["net"] for row in rows}


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


def test_recording_the_repayment_answers_the_notice(client, house):
    tell(client, house, house["tien"])
    tell(client, house, house["tien"], token=house["lan_token"])
    paid = client.post(  # Tiến, who received it, records Minh's repayment
        f"/api/households/{house['id']}/settlements",
        json={"from_member_id": house["minh"], "to_member_id": house["tien"], "amount": 100000,
              "settled_at": "2026-11-03"},
    )
    assert paid.status_code == 201, paid.text
    assert [n["from_member_id"] for n in notices(client, house["id"])] == [house["lan"]]


def test_not_received_shows_on_the_payers_card_until_they_tell_again(client, house):
    tell(client, house, house["tien"])
    declined = client.post(f"/api/households/{house['id']}/notices/{house['minh']}/decline")
    assert declined.status_code == 200, declined.text
    assert declined.json()["status"] == "declined"
    assert notices(client, house["id"], house["minh_token"])[0]["status"] == "declined"
    # Declining twice: nothing is waiting any more
    again = client.post(f"/api/households/{house['id']}/notices/{house['minh']}/decline")
    assert again.status_code == 404
    assert error_code(again) == "notice_not_found"
    # Telling again sends it again, with the new amount
    retold = tell(client, house, house["tien"], amount=90000)
    assert retold.json()["status"] == "sent"
    assert retold.json()["amount"] == 90000


def test_only_the_receiver_can_decline(client, house):
    tell(client, house, house["tien"])
    path = f"/api/households/{house['id']}/notices/{house['minh']}/decline"
    for token in (house["minh_token"], house["lan_token"]):
        response = client.post(path, headers=bearer(token))
        assert response.status_code == 404, response.text
    assert notices(client, house["id"])[0]["status"] == "sent"


def test_the_payer_takes_their_notice_back_and_nobody_else_can(client, house):
    tell(client, house, house["tien"])
    path = f"/api/households/{house['id']}/notices/{house['tien']}"
    assert client.delete(path, headers=bearer(house["lan_token"])).status_code == 204
    assert client.delete(path).status_code == 204  # the receiver has no notice of their own to it
    assert len(notices(client, house["id"])) == 1
    assert client.delete(path, headers=bearer(house["minh_token"])).status_code == 204
    assert notices(client, house["id"]) == []

