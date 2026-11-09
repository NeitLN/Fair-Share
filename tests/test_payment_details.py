"""Who may see a receiving account, and what the payment details say (specs/016-vietqr, US3, US2).

GET /api/households/{h}/members/{m}/payment answers, in this order (research R5): 401 without a
session; the house's own 404 for anyone not an owner or member of it; the member's own 404 for
someone not a current owner or member there; 409 when the asker is not suggested to pay that member
right now; otherwise the state of the code (FR-015). The 404s never depend on whether an account is
saved (FR-008, FR-009, SC-004). Account numbers here are made up (FR-006).

The house: Tiến (the owner, the test client), Minh, Lan and An. Minh paid 300.000đ for himself and
Lan, so Lan owes Minh 150.000đ; Tiến and An owe nobody.
"""

import logging
import threading
import time

import psycopg
import pytest

from app.services import vietqr
from tests.api import error_code, household, member, remove_access
from tests.conftest import bearer

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]

VCB = "970436"
NUMBER = "0123456789"
NOWHERE = 10**12  # an id that does not exist


@pytest.fixture
def house(client) -> dict:
    h = household(client, "Nhà trọ Q7")
    ids = {name: member(client, h["id"], name)["id"] for name in ("Tiến", "Minh", "Lan", "An")}
    spend(client, h["id"], ids["Minh"], 300_000, [ids["Minh"], ids["Lan"]])
    return {"id": h["id"], **ids, "tokens": client.member_tokens}


def spend(client, house_id, payer, amount, members):
    response = client.post(f"/api/households/{house_id}/expenses", json={
        "description": "Tiền nhà", "amount": amount, "payer_id": payer, "spent_at": "2026-11-01",
        "split": {"type": "equal", "member_ids": members}})
    assert response.status_code == 201, response.text


def save_account(client, token, number=NUMBER, name="Nguyễn Văn Minh", bank=VCB):
    response = client.put("/api/me/receiving-account", headers=bearer(token),
                          json={"bank_bin": bank, "account_number": number, "holder_name": name})
    assert response.status_code == 200, response.text


def payment(client, house_id, member_id, token=None, acknowledge=None):
    query = f"?acknowledge={acknowledge}" if acknowledge is not None else ""
    url = f"/api/households/{house_id}/members/{member_id}/payment{query}"
    if token is None:
        return client.get(url)
    return client.get(url, headers=bearer(token))


def tell(client, house, amount, version=None):
    response = client.put(f"/api/households/{house['id']}/notices", headers=bearer(
        house["tokens"][house["Lan"]]), json={"to_member_id": house["Minh"], "amount": amount,
                                              "version": version})
    assert response.status_code == 200, response.text
    return response.json()


def comparable(response):
    """What an answer says: status, body and the headers that could depend on the data."""
    headers = {k: v for k, v in response.headers.items() if k.lower() not in ("date",)}
    return response.status_code, response.text, headers


# --- Access (FR-007 to FR-011, SC-004) -


@pytest.mark.parametrize("with_account", [False, True])
def test_people_outside_the_house_get_the_house_not_found_answer(client, house, with_account):
    if with_account:
        save_account(client, house["tokens"][house["Minh"]])
    stranger = client.sign_up(display_name="Hoa")
    waiting = client.sign_up(display_name="Vy")
    code = client.get(f"/api/households/{house['id']}/invite").json()["code"]
    client.post("/api/join", json={"code": code}, headers=bearer(waiting))
    removed = house["tokens"][house["An"]]
    remove_access(client, house["id"], house["An"])

    nowhere = comparable(payment(client, NOWHERE, house["Minh"], token=stranger))
    assert nowhere[0] == 404 and "household_not_found" in nowhere[1]
    for token in (stranger, waiting, removed):
        assert comparable(payment(client, house["id"], house["Minh"], token=token)) == nowhere


@pytest.mark.parametrize("with_account", [False, True])
def test_someone_no_longer_in_the_house_gets_the_member_not_found_answer(
    client, house, with_account
):
    lan = house["tokens"][house["Lan"]]
    an = house["tokens"][house["An"]]
    if with_account:
        save_account(client, an)
    other = household(client, "Nhà khác")
    stranger_id = member(client, other["id"], "Tiến")["id"]
    remove_access(client, house["id"], house["An"])  # An's name stays, An's account goes

    nowhere = comparable(payment(client, house["id"], NOWHERE, token=lan))
    assert nowhere[0] == 404 and "member_not_found" in nowhere[1]
    for member_id in (house["An"], stranger_id):
        assert comparable(payment(client, house["id"], member_id, token=lan)) == nowhere


def test_without_a_session_nothing(client, house):
    url = f"/api/households/{house['id']}/members/{house['Minh']}/payment"
    response = client.anonymous().get(url)
    assert response.status_code == 401


@pytest.mark.parametrize("asker", ["An", "Tiến"])
def test_a_housemate_who_owes_nothing_gets_no_details(client, house, asker):
    save_account(client, house["tokens"][house["Minh"]])
    response = payment(client, house["id"], house["Minh"], token=house["tokens"][house[asker]])
    assert response.status_code == 409
    assert error_code(response) == "payment_not_suggested"
    assert NUMBER not in response.text and "NGUYEN" not in response.text


def test_nobody_pays_themselves(client, house):
    save_account(client, house["tokens"][house["Lan"]])
    response = payment(client, house["id"], house["Lan"], token=house["tokens"][house["Lan"]])
    assert response.status_code == 409
    assert error_code(response) == "payment_not_suggested"


def join_as(client, house_id, token) -> int:
    """The account of `token` joins house `house_id` and is approved; its member id there."""
    code = client.get(f"/api/households/{house_id}/invite").json()["code"]
    client.post("/api/join", json={"code": code}, headers=bearer(token))
    user_id = client.get("/api/auth/me", headers=bearer(token)).json()["id"]
    approved = client.post(f"/api/households/{house_id}/requests/{user_id}/approve", json={})
    assert approved.status_code == 200, approved.text
    return approved.json()["id"]


def test_owing_someone_in_one_house_shows_nothing_in_another(client, house):
    """The same two accounts in two houses: Lan owes Minh in the first, nothing in the second."""
    lan = house["tokens"][house["Lan"]]
    minh = house["tokens"][house["Minh"]]
    save_account(client, minh)
    other = household(client, "Nhà B")
    member(client, other["id"], "Tiến")
    minh_b = join_as(client, other["id"], minh)
    join_as(client, other["id"], lan)
    assert payment(client, house["id"], house["Minh"], token=lan).status_code == 200
    response = payment(client, other["id"], minh_b, token=lan)
    assert response.status_code == 409
    assert NUMBER not in response.text


# --- States (FR-013 to FR-015) -


def lan_pays_minh(client, house, **kwargs):
    response = payment(client, house["id"], house["Minh"], token=house["tokens"][house["Lan"]],
                       **kwargs)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()


def test_ready_has_the_details_the_amount_and_the_message(client, house):
    save_account(client, house["tokens"][house["Minh"]])
    details = lan_pays_minh(client, house)
    snapshot = details.pop("snapshot")
    assert len(snapshot) == 12
    assert details == {
        "state": "ready", "suggested": 150_000, "told": None, "amount": 150_000,
        "notice_version": None, "message": "FS NHATROQ7 LAN",
        "account": {"bank_bin": VCB, "bank_name": "Vietcombank", "account_number": NUMBER,
                    "holder_name": "NGUYEN VAN MINH"},
    }


def test_no_account_says_so_without_details(client, house, monkeypatch):
    details = lan_pays_minh(client, house)
    assert (details["state"], details["account"], details["message"]) == ("no_account", None, None)
    save_account(client, house["tokens"][house["Minh"]])
    monkeypatch.delitem(vietqr.BANKS, VCB)  # the bank left the list
    assert lan_pays_minh(client, house)["state"] == "no_account"


def test_a_waiting_notice_leaves_the_rest_in_the_code(client, house):
    save_account(client, house["tokens"][house["Minh"]])
    told = tell(client, house, 100_000)
    details = lan_pays_minh(client, house)
    assert (details["state"], details["told"], details["amount"], details["notice_version"]) == (
        "partly_told", 100_000, 50_000, told["version"])
    assert details["account"]["account_number"] == NUMBER


def test_a_notice_covering_the_debt_shows_no_details(client, house):
    save_account(client, house["tokens"][house["Minh"]])
    tell(client, house, 150_000)
    details = lan_pays_minh(client, house)
    assert (details["state"], details["amount"], details["account"]) == ("covered", None, None)


def test_a_declined_notice_needs_an_acknowledgement_first(client, house):
    save_account(client, house["tokens"][house["Minh"]])
    told = tell(client, house, 100_000)
    declined = client.post(f"/api/households/{house['id']}/notices/{house['Lan']}/decline",
                           json={"version": told["version"]},
                           headers=bearer(house["tokens"][house["Minh"]]))
    assert declined.status_code == 200, declined.text
    version = declined.json()["version"]
    first = lan_pays_minh(client, house)
    assert (first["state"], first["account"], first["told"]) == ("declined", None, 100_000)
    assert lan_pays_minh(client, house, acknowledge=version - 1)["state"] == "declined"
    acknowledged = lan_pays_minh(client, house, acknowledge=version)
    assert (acknowledged["state"], acknowledged["amount"]) == ("declined_acknowledged", 150_000)
    assert acknowledged["account"]["account_number"] == NUMBER


@pytest.mark.parametrize("total, state", [(999_999_998, "ready"), (1_000_000_000, "too_large")])
def test_from_half_a_billion_there_is_no_code(client, house, total, state):
    save_account(client, house["tokens"][house["Minh"]])
    spend(client, house["id"], house["Minh"], total - 300_000, [house["Minh"], house["Lan"]])
    details = lan_pays_minh(client, house)
    assert (details["state"], details["amount"]) == (state, total // 2)
    assert details["account"]["account_number"] == NUMBER  # the details still show, as text


def test_the_snapshot_changes_with_the_amount_the_notice_and_the_account_only(client, house):
    minh = house["tokens"][house["Minh"]]
    save_account(client, minh)
    first = lan_pays_minh(client, house)["snapshot"]
    assert lan_pays_minh(client, house)["snapshot"] == first
    spend(client, house["id"], house["Minh"], 2_000, [house["Minh"], house["Lan"]])
    second = lan_pays_minh(client, house)["snapshot"]
    assert second != first
    tell(client, house, 1_000)
    third = lan_pays_minh(client, house)["snapshot"]
    assert third != second
    save_account(client, minh, number="9988776655")
    assert lan_pays_minh(client, house)["snapshot"] != third


def test_reading_the_details_changes_nothing(client, house, db_url):
    save_account(client, house["tokens"][house["Minh"]])
    tell(client, house, 100_000)

    def counts():
        with psycopg.connect(db_url) as conn:
            return conn.execute(
                "SELECT (SELECT count(*) FROM settlements WHERE household_id = %s),"
                " (SELECT count(*) FROM payment_notices WHERE household_id = %s),"
                " (SELECT max(version) FROM payment_notices WHERE household_id = %s)",
                (house["id"],) * 3).fetchone()

    before = counts()
    lan_pays_minh(client, house)
    lan_pays_minh(client, house)
    assert counts() == before


# --- One consistent read; nothing in the logs -


def test_a_repayment_being_written_is_waited_for(make_client, client, house, db_url):
    """Held on the house: a repayment of 50.000đ is being written when Lan opens the code. The read
    waits for it, then returns the new amount (research R4)."""
    save_account(client, house["tokens"][house["Minh"]])
    answers: list[dict] = []
    other = make_client()
    blocker = psycopg.connect(db_url)
    try:
        blocker.execute("SELECT 1 FROM households WHERE id = %s FOR SHARE", (house["id"],))
        blocker.execute(
            "INSERT INTO settlements (household_id, from_member_id, to_member_id, amount,"
            " settled_at) VALUES (%s, %s, %s, 50000, '2026-11-02')",
            (house["id"], house["Lan"], house["Minh"]))
        worker = threading.Thread(target=lambda: answers.append(payment(
            other, house["id"], house["Minh"], token=house["tokens"][house["Lan"]]).json()))
        worker.start()
        time.sleep(0.8)
        assert answers == []  # waiting for the house
        blocker.commit()
        worker.join(timeout=10)
    finally:
        blocker.close()
    assert answers[0]["amount"] == 100_000


def test_no_account_number_or_name_reaches_the_log(client, house, caplog):
    caplog.set_level(logging.DEBUG)
    save_account(client, house["tokens"][house["Minh"]])
    lan_pays_minh(client, house)
    client.put("/api/me/receiving-account", headers=bearer(house["tokens"][house["Minh"]]),
               json={"bank_bin": "999999", "account_number": NUMBER, "holder_name": "x"})
    assert NUMBER not in caplog.text
    assert "NGUYEN" not in caplog.text and "Nguyễn" not in caplog.text
