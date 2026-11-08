"""Telling someone "Tôi đã chuyển" (docs/ACCOUNTS.md, S3): the one who owes tells the one paid.

A notice changes no balance. It is money told and not yet recorded (specs/014): the receiver's
"Đã nhận" records all or part of it (S2) and takes that out of it; "Chưa nhận được" leaves it on the
payer's card as declined. Every action names the version of the notice its screen showed, so an
action from an old screen never touches a notice that changed since.
"""
import threading
import time

import psycopg
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


def version_of(client, house, sender, to):
    """The version a screen would show for the pair (None when there is no notice)."""
    for n in notices(client, house["id"]):
        if (n["from_member_id"], n["to_member_id"]) == (sender, to):
            return n["version"]
    return None


def tell(client, house, to, amount=100000, token=None, version="current", note=None):
    token = token or house["minh_token"]
    if version == "current":
        me = next(m for m, t in client.member_tokens.items() if t == token)
        version = version_of(client, house, me, to)
    body = {"to_member_id": to, "amount": amount, "version": version}
    if note is not None:
        body["note"] = note
    return client.put(f"/api/households/{house['id']}/notices", json=body, headers=bearer(token))


def accept(client, house, sender, version="current", received=None, headers=None):
    """Tiến's "Đã nhận" on what `sender` told him (all of it, or `received`)."""
    if version == "current":
        version = version_of(client, house, sender, house["tien"])
    body = {"version": version, "settled_at": "2026-11-03"}
    if received is not None:
        body["received"] = received
    return client.post(
        f"/api/households/{house['id']}/notices/{sender}/accept", json=body, headers=headers or {}
    )


def decline(client, house, sender, version="current", token=None):
    if version == "current":
        version = version_of(client, house, sender, house["tien"])
    return client.post(
        f"/api/households/{house['id']}/notices/{sender}/decline",
        json={"version": version},
        headers=bearer(token) if token else {},
    )


def take_back(client, house, to, version, token=None):
    return client.delete(
        f"/api/households/{house['id']}/notices/{to}?version={version}",
        headers=bearer(token or house["minh_token"]),
    )


def pay_by_hand(client, house, sender, amount, notice_version=None):
    """Tiến types in a repayment from `sender`; with notice_version it is the told money."""
    body = {"from_member_id": sender, "to_member_id": house["tien"], "amount": amount,
            "settled_at": "2026-11-03"}
    if notice_version is not None:
        body["notice"] = {"version": notice_version}
    return client.post(f"/api/households/{house['id']}/settlements", json=body)


def balances(client, h):
    rows = client.get(f"/api/households/{h}/balances").json()["balances"]
    return {row["member_id"]: row["net"] for row in rows}


def settlements(client, h):
    return client.get(f"/api/households/{h}/settlements").json()


def test_telling_the_receiver_changes_no_balance_and_everyone_sees_it(client, house):
    before = balances(client, house["id"])
    response = tell(client, house, house["tien"])
    assert response.status_code == 200, response.text
    assert response.json() | {"created_at": None, "version": None} == {
        "from_member_id": house["minh"], "to_member_id": house["tien"], "amount": 100000,
        "status": "sent", "note": None, "version": None, "created_at": None,
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
    shown = version_of(client, house, house["minh"], house["tien"])
    first = accept(client, house, house["minh"], version=shown)
    assert first.status_code == 201, first.text
    assert first.json()["amount"] == 100000
    assert first.json()["from_member_id"] == house["minh"]
    assert first.json()["to_member_id"] == house["tien"]
    assert notices(client, house["id"]) == []
    # Pressed again (another tab, a retry after a lost answer): nothing more is recorded
    again = accept(client, house, house["minh"], version=shown)
    assert again.status_code == 409
    assert error_code(again) == "notice_changed"
    assert len(settlements(client, house["id"])) == 1


def test_received_at_the_same_moment_twice_records_it_once(make_client, client, house):
    tell(client, house, house["tien"])
    shown = version_of(client, house, house["minh"], house["tien"])
    tien_token = client.member_tokens[house["tien"]]
    clients = [make_client() for _ in range(4)]
    answers = at_once(
        [lambda c=c: accept(c, house, house["minh"], version=shown,
                            headers=bearer(tien_token)).status_code
         for c in clients]
    )
    assert sorted(answers) == [201, 409, 409, 409]
    assert len(settlements(client, house["id"])) == 1


def test_an_answer_to_an_old_notice_changes_nothing(client, house):
    """Tiến's screen still shows Minh's 100.000đ, but an expense since made it 150.000đ and Minh
    told again."""
    tell(client, house, house["tien"])
    old = version_of(client, house, house["minh"], house["tien"])
    client.post(
        f"/api/households/{house['id']}/expenses",
        json={"description": "Tiền điện", "amount": 150000, "payer_id": house["tien"],
              "spent_at": "2026-11-02",
              "split": {"type": "equal", "member_ids": [house["tien"], house["minh"],
                                                        house["lan"]]}},
    )
    assert tell(client, house, house["tien"], amount=150000).status_code == 200
    for stale in (accept(client, house, house["minh"], version=old),
                  decline(client, house, house["minh"], version=old)):
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


def test_the_told_money_recorded_by_hand_answers_the_notice(client, house):
    """Tiến records Minh's repayment from "Ghi khoản trả khác", saying it is the money Minh
    told."""
    tell(client, house, house["tien"])
    tell(client, house, house["tien"], token=house["lan_token"])
    version = version_of(client, house, house["minh"], house["tien"])
    paid = pay_by_hand(client, house, house["minh"], 100000, notice_version=version)
    assert paid.status_code == 201, paid.text
    assert paid.json()["notice_amount"] == 100000
    assert [n["from_member_id"] for n in notices(client, house["id"])] == [house["lan"]]


def test_another_repayment_leaves_the_notice_to_be_answered(client, house):
    """A separate repayment, even of the same 100.000đ, is not taken as the told money: only the
    receiver can say it is (the old "same amount" guess let the money be recorded twice)."""
    tell(client, house, house["tien"])
    for amount in (30000, 100000):
        paid = pay_by_hand(client, house, house["minh"], amount)
        assert paid.status_code == 201, paid.text
        assert paid.json()["notice_amount"] is None
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
    # It kept its amount
    assert notices(client, house["id"])[0]["amount"] == 100000
    # Telling again sends it again
    retold = tell(client, house, house["tien"])
    assert retold.json()["status"] == "sent"


def test_the_payer_takes_their_notice_back_and_nobody_else_can(client, house):
    tell(client, house, house["tien"])
    version = version_of(client, house, house["minh"], house["tien"])
    # Lan, or Tiến (the receiver), have no notice of their own to Tiến: nothing to take back
    lan = take_back(client, house, house["tien"], version, token=house["lan_token"])
    assert lan.status_code == 409
    tien_token = client.member_tokens[house["tien"]]
    assert take_back(client, house, house["tien"], version, token=tien_token).status_code == 409
    assert len(notices(client, house["id"])) == 1
    assert take_back(client, house, house["tien"], version).status_code == 204
    assert notices(client, house["id"]) == []


def test_taking_back_an_old_version_changes_nothing(client, house):
    tell(client, house, house["tien"])
    old = version_of(client, house, house["minh"], house["tien"])
    tell(client, house, house["tien"])  # told again: a new version
    response = take_back(client, house, house["tien"], old)
    assert response.status_code == 409
    assert error_code(response) == "notice_changed"
    assert len(notices(client, house["id"])) == 1


# --- specs/014-partial-transfer-notices, PR-1 --------------------------------------------------


def test_telling_names_the_notice_it_replaces(client, house):
    """Telling with no notice on screen while one exists, or with an old one, changes nothing."""
    assert tell(client, house, house["tien"], version=None).status_code == 200
    again = tell(client, house, house["tien"], version=None)
    assert again.status_code == 409
    assert error_code(again) == "notice_changed"
    assert tell(client, house, house["tien"], version=999_999_999).status_code == 409
    # And a version for a pair that has no notice
    lans = tell(client, house, house["tien"], token=house["lan_token"], version=1)
    assert lans.status_code == 409


def test_a_stale_notice_is_reported_before_a_changed_suggestion(client, house):
    tell(client, house, house["tien"])
    response = tell(client, house, house["tien"], amount=90000, version=None)
    assert error_code(response) == "notice_changed"


def test_part_of_a_notice_is_confirmed_and_the_rest_keeps_waiting(client, house):
    tell(client, house, house["tien"], note="chuyển qua Momo")
    before = version_of(client, house, house["minh"], house["tien"])
    first = accept(client, house, house["minh"], received=60000)
    assert first.status_code == 201, first.text
    assert (first.json()["amount"], first.json()["notice_amount"]) == (60000, 60000)
    assert first.json()["note"] == "chuyển qua Momo"
    [left] = notices(client, house["id"])
    assert (left["amount"], left["status"], left["note"]) == (40000, "sent", "chuyển qua Momo")
    assert left["version"] != before
    # The rest, then nothing more
    assert accept(client, house, house["minh"]).json()["amount"] == 40000
    assert notices(client, house["id"]) == []
    assert sum(r["amount"] for r in settlements(client, house["id"])) == 100000


def test_more_than_told_cannot_be_confirmed(client, house):
    tell(client, house, house["tien"])
    response = accept(client, house, house["minh"], received=100001)
    assert response.status_code == 422
    assert settlements(client, house["id"]) == []


@pytest.mark.parametrize("bad", ["60000", True, 0, -5, 1.5])
def test_received_is_a_whole_positive_number(client, house, bad):
    tell(client, house, house["tien"])
    assert accept(client, house, house["minh"], received=bad).status_code == 422


def test_told_money_by_hand_takes_at_most_the_notice(client, house):
    tell(client, house, house["tien"])
    version = version_of(client, house, house["minh"], house["tien"])
    part = pay_by_hand(client, house, house["minh"], 30000, notice_version=version)
    assert part.json()["notice_amount"] == 30000
    assert [n["amount"] for n in notices(client, house["id"])] == [70000]
    version = version_of(client, house, house["minh"], house["tien"])
    more = pay_by_hand(client, house, house["minh"], 90000, notice_version=version)
    assert more.json()["notice_amount"] == 70000  # the other 20.000đ is another repayment
    assert notices(client, house["id"]) == []


def test_told_money_by_hand_from_an_old_screen_records_nothing(client, house):
    tell(client, house, house["tien"])
    old = version_of(client, house, house["minh"], house["tien"])
    assert accept(client, house, house["minh"]).status_code == 201  # confirmed meanwhile
    response = pay_by_hand(client, house, house["minh"], 100000, notice_version=old)
    assert response.status_code == 409
    assert error_code(response) == "notice_changed"
    assert len(settlements(client, house["id"])) == 1


def test_a_declined_notice_keeps_its_state_while_paid_in_part(client, house):
    tell(client, house, house["tien"])
    decline(client, house, house["minh"])
    version = version_of(client, house, house["minh"], house["tien"])
    pay_by_hand(client, house, house["minh"], 40000, notice_version=version)
    [left] = notices(client, house["id"])
    assert (left["amount"], left["status"]) == (60000, "declined")


def test_by_hand_and_confirming_at_once_never_record_more_than_told(make_client, client, house,
                                                                   db_url):
    """Not merely started together: the house is held while both requests are sent, so both are
    inside their transactions, waiting on the same lock, when it is let go."""
    tell(client, house, house["tien"])
    version = version_of(client, house, house["minh"], house["tien"])
    tien_token = client.member_tokens[house["tien"]]
    one, two = make_client(), make_client()
    body = {"from_member_id": house["minh"], "to_member_id": house["tien"], "amount": 100000,
            "settled_at": "2026-11-03", "notice": {"version": version}}
    answers: list[int] = []
    blocker = psycopg.connect(db_url)
    try:
        blocker.execute("SELECT 1 FROM households WHERE id = %s FOR UPDATE", (house["id"],))
        workers = [
            threading.Thread(target=lambda: answers.append(
                accept(one, house, house["minh"], version=version,
                       headers=bearer(tien_token)).status_code)),
            threading.Thread(target=lambda: answers.append(
                two.post(f"/api/households/{house['id']}/settlements", json=body,
                         headers=bearer(tien_token)).status_code)),
        ]
        for worker in workers:
            worker.start()
        time.sleep(0.8)
        assert answers == []  # both waiting on the house
        blocker.rollback()
        for worker in workers:
            worker.join(timeout=10)
    finally:
        blocker.close()
    assert sorted(answers) == [201, 409]
    recorded = settlements(client, house["id"])
    assert sum(r["notice_amount"] or 0 for r in recorded) == 100000
    assert len(recorded) == 1


def test_telling_twice_from_two_tabs_with_no_notice_on_screen_tells_once(make_client, client,
                                                                         house, db_url):
    """Both tabs showed no notice (version null); held together on the house, one tells and the
    other is refused: the upsert itself names the version it replaces."""
    minh_token = house["minh_token"]
    one, two = make_client(), make_client()
    answers: list[int] = []
    blocker = psycopg.connect(db_url)
    try:
        blocker.execute("SELECT 1 FROM households WHERE id = %s FOR UPDATE", (house["id"],))
        workers = [
            threading.Thread(target=lambda c=c: answers.append(c.put(
                f"/api/households/{house['id']}/notices",
                json={"to_member_id": house["tien"], "amount": 100000, "version": None},
                headers=bearer(minh_token)).status_code))
            for c in (one, two)
        ]
        for worker in workers:
            worker.start()
        time.sleep(0.8)
        assert answers == []
        blocker.rollback()
        for worker in workers:
            worker.join(timeout=10)
    finally:
        blocker.close()
    assert sorted(answers) == [200, 409]
    assert len(notices(client, house["id"])) == 1


def test_undoing_a_confirmation_gives_the_amount_back(client, house):
    tell(client, house, house["tien"])
    paid = accept(client, house, house["minh"]).json()
    assert client.delete(f"/api/settlements/{paid['id']}").status_code == 204
    [back] = notices(client, house["id"])
    assert (back["from_member_id"], back["amount"], back["status"]) == (
        house["minh"], 100000, "sent"
    )


def test_deleting_leaves_a_notice_told_since_as_it_is(client, house):
    tell(client, house, house["tien"])
    paid = accept(client, house, house["minh"], received=60000).json()
    # 40.000đ still waits: deleting the 60.000đ gives nothing back into it
    assert client.delete(f"/api/settlements/{paid['id']}").status_code == 204
    assert [(n["amount"], n["status"]) for n in notices(client, house["id"])] == [(40000, "sent")]


def test_deleting_another_repayment_gives_nothing_back(client, house):
    paid = pay_by_hand(client, house, house["minh"], 50000).json()
    assert client.delete(f"/api/settlements/{paid['id']}").status_code == 204
    assert notices(client, house["id"]) == []


def test_a_note_is_cleaned_and_kept_short(client, house):
    told = tell(client, house, house["tien"], note="  chuyển trước\nmột nửa  ")
    assert told.json()["note"] == "chuyển trước một nửa"
    blank = tell(client, house, house["tien"], note="   ")
    assert blank.json()["note"] is None
    assert tell(client, house, house["tien"], note="x" * 121).status_code == 422


def test_money_writes_wait_while_a_transfer_is_being_told(client, house, db_url):
    """While a telling holds the house (FOR UPDATE, between its balance check and its write), an
    expense, a repayment or a confirmation waits; it does not slip in between (research R2)."""
    blocker = psycopg.connect(db_url)
    try:
        blocker.execute("SELECT 1 FROM households WHERE id = %s FOR UPDATE", (house["id"],))
        done: list[int] = []

        def save_expense():
            response = client.post(
                f"/api/households/{house['id']}/expenses",
                json={"description": "Điện", "amount": 90000, "payer_id": house["tien"],
                      "spent_at": "2026-11-02", "split": {"type": "equal",
                      "member_ids": [house["tien"], house["minh"], house["lan"]]}},
            )
            done.append(response.status_code)

        worker = threading.Thread(target=save_expense)
        worker.start()
        time.sleep(0.8)
        assert done == []  # still waiting for the house
        blocker.rollback()
        worker.join(timeout=10)
        assert done == [201]
    finally:
        blocker.close()
