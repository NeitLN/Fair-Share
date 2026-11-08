"""An invited person knows which house they are joining (specs/015-invite-preview, docs/ACCOUNTS.md
D4, J1, J2).

A valid code shows a signed-in person the house's name and its owner's display name, and nothing
else. Wrong, expired and replaced codes all get the answer /join gives. Guesses count toward J2
whether previewed or sent. A refusal, or the house deleted while waiting, leaves the person an
outcome that only they read and dismiss.
"""
import threading
import time

import psycopg
import pytest

from app.routers import accounts
from tests.api import error_code, household
from tests.conftest import bearer
from tests.test_accounts import from_ip, register

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]


@pytest.fixture
def house(client) -> dict:
    created = household(client, "Nhà trọ Q7")
    created["code"] = client.get(f"/api/households/{created['id']}/invite").json()["code"]
    people = client.get(f"/api/households/{created['id']}/members").json()
    created["owner_name"] = next(m["name"] for m in people if m.get("role") == "owner")
    return created


def preview(client, code, token=None, headers=None):
    extra = {**(headers or {}), **(bearer(token) if token else {})}
    return client.anonymous().post("/api/invites/preview", json={"code": code}, headers=extra)


def join(client, code, token, headers=None):
    return client.anonymous().post(
        "/api/join", json={"code": code}, headers={**(headers or {}), **bearer(token)}
    )


def requests_of(client, token):
    response = client.anonymous().get("/api/me/requests", headers=bearer(token))
    assert response.status_code == 200, response.text
    return response.json()


# --- Preview ------------------------------------------------------------------------------------


def test_a_valid_code_shows_the_house_and_its_owner_only(client, house):
    lan = client.sign_up("Lan")
    response = preview(client, house["code"].lower(), lan)  # read like /join: case does not matter
    assert response.status_code == 200, response.text
    assert response.json() == {
        "house_name": "Nhà trọ Q7", "owner_name": house["owner_name"], "member": False,
        "household_id": None,
    }


def test_a_member_is_told_they_are_in_it_already(client, house):
    response = preview(client, house["code"], client.token)  # the owner
    assert response.json()["member"] is True
    assert response.json()["household_id"] == house["id"]


def test_wrong_expired_and_replaced_codes_answer_exactly_like_join(client, house, db_url):
    lan = client.sign_up("Lan")
    answers = [preview(client, "ZZZZZZZZ", lan), join(client, "ZZZZZZZZ", client.sign_up("A"))]
    replaced = house["code"]
    client.post(f"/api/households/{house['id']}/invite")  # a new code replaces it
    answers.append(preview(client, replaced, client.sign_up("B")))
    current = client.get(f"/api/households/{house['id']}/invite").json()["code"]
    with psycopg.connect(db_url) as conn:
        conn.execute("UPDATE invite_codes SET expires_at = now() WHERE code = %s", (current,))
    answers.append(preview(client, current, client.sign_up("C")))
    statuses = {r.status_code for r in answers}
    bodies = {r.text for r in answers}
    headers = {tuple(sorted((k, v) for k, v in r.headers.items() if k != "content-length"))
               for r in answers}
    assert statuses == {404}
    assert len(bodies) == 1 and error_code(answers[0]) == "invalid_code"
    assert len(headers) == 1


def test_a_preview_needs_a_session(client, house):
    assert preview(client, house["code"]).status_code == 401


def test_wrong_previews_and_wrong_joins_share_the_guessing_limit(client, house):
    """J2: five wrong codes a minute for one account, counted across both."""
    minh = client.sign_up("Minh")
    for i in range(accounts.JOIN_PER_USER):
        call = preview if i % 2 else join
        assert call(client, "ZZZZZZZZ", minh).status_code == 404
    for call in (preview, join):
        blocked = call(client, house["code"], minh)
        assert blocked.status_code == 429
        assert error_code(blocked) == "too_many_attempts"
        assert int(blocked.headers["Retry-After"]) >= 1


def test_the_address_limit_counts_previews_from_every_account(make_client, house, monkeypatch):
    """Wrong codes from one address, spread over accounts that each stay under their own five, add
    up to the address limit; then any account from there is refused. The tests lift the address
    limits (conftest.py), so this one sets its own small one."""
    monkeypatch.setattr(accounts, "JOIN_PER_IP", 8)
    client = make_client(forwarded_hops=1)
    address = from_ip()
    per_account = accounts.JOIN_PER_USER - 1
    for _ in range(accounts.JOIN_PER_IP // per_account):
        token = register(client, headers=from_ip()).json()["token"]
        for _ in range(per_account):
            assert preview(client, "ZZZZZZZZ", token, headers=address).status_code == 404
    late = register(client, headers=from_ip()).json()["token"]
    blocked = preview(client, house["code"], late, headers=address)
    assert blocked.status_code == 429
    assert error_code(blocked) == "too_many_attempts"


def test_previews_in_all_are_limited_but_joining_is_not(client, house):
    lan = client.sign_up("Lan")
    for _ in range(accounts.PREVIEW_PER_USER):
        assert preview(client, house["code"], lan).status_code == 200
    over = preview(client, house["code"], lan)
    assert over.status_code == 429
    assert error_code(over) == "too_many_previews"
    assert join(client, house["code"], lan).status_code == 200


def test_a_burst_of_wrong_previews_never_gets_more_than_the_limit(make_client, house):
    lan_client = make_client()
    lan = lan_client.sign_up("Lan")
    clients = [make_client() for _ in range(10)]
    answers: list[int] = []
    barrier = threading.Barrier(len(clients))

    def guess(c):
        barrier.wait()
        answers.append(preview(c, "ZZZZZZZZ", lan).status_code)

    workers = [threading.Thread(target=guess, args=(c,)) for c in clients]
    for w in workers:
        w.start()
    for w in workers:
        w.join(timeout=20)
    assert answers.count(404) == accounts.JOIN_PER_USER
    assert answers.count(429) == len(clients) - accounts.JOIN_PER_USER


# --- Waiting and outcomes -----------------------------------------------------------------------


def test_a_waiting_card_names_the_house_and_its_owner(client, house):
    lan = client.sign_up("Lan")
    join(client, house["code"], lan)
    [waiting] = requests_of(client, lan)["pending"]
    assert (waiting["household_id"], waiting["household_name"], waiting["owner_name"]) == (
        house["id"], "Nhà trọ Q7", house["owner_name"]
    )
    listed = client.anonymous().get("/api/households", headers=bearer(lan)).json()
    assert listed["pending"][0]["household_name"] == "Nhà trọ Q7"


def lan_waiting(client, house):
    lan = client.sign_up("Lan")
    join(client, house["code"], lan)
    lan_id = client.anonymous().get("/api/auth/me", headers=bearer(lan)).json()["id"]
    return lan, lan_id


def test_a_refusal_leaves_lan_an_outcome_with_the_names_as_they_were(client, house):
    lan, lan_id = lan_waiting(client, house)
    assert client.post(f"/api/households/{house['id']}/requests/{lan_id}/reject").status_code == 204
    client.patch(f"/api/households/{house['id']}", json={"name": "Nhà mới"})  # renamed after
    body = requests_of(client, lan)
    assert body["pending"] == [] and house["id"] not in body["joined"]
    [outcome] = body["outcomes"]
    assert (outcome["kind"], outcome["household_name"], outcome["owner_name"]) == (
        "refused", "Nhà trọ Q7", house["owner_name"]
    )


def test_a_deleted_house_leaves_everyone_waiting_an_outcome(client, house):
    lan, _ = lan_waiting(client, house)
    assert client.delete(f"/api/households/{house['id']}").status_code == 204
    [outcome] = requests_of(client, lan)["outcomes"]
    assert (outcome["kind"], outcome["household_id"]) == ("house_deleted", house["id"])


def test_approval_shows_as_joined(client, house):
    lan, lan_id = lan_waiting(client, house)
    client.post(f"/api/households/{house['id']}/requests/{lan_id}/approve", json={})
    body = requests_of(client, lan)
    assert body["pending"] == [] and body["joined"] == [house["id"]] and body["outcomes"] == []


def test_asking_again_removes_the_outcome(client, house):
    lan, lan_id = lan_waiting(client, house)
    client.post(f"/api/households/{house['id']}/requests/{lan_id}/reject")
    assert join(client, house["code"], lan).status_code == 200
    assert requests_of(client, lan)["outcomes"] == []


def test_only_lan_reads_and_dismisses_her_outcome(client, house):
    lan, lan_id = lan_waiting(client, house)
    client.post(f"/api/households/{house['id']}/requests/{lan_id}/reject")
    [outcome] = requests_of(client, lan)["outcomes"]
    minh = client.sign_up("Minh")
    assert requests_of(client, minh)["outcomes"] == []
    path = f"/api/me/outcomes/{outcome['id']}"
    for other in (minh, None):  # another account, and the owner (the client's own account)
        headers = bearer(other) if other else {}
        response = client.delete(path, headers=headers) if other is None else \
            client.anonymous().delete(path, headers=headers)
        assert response.status_code == 404
        assert error_code(response) == "outcome_not_found"
    assert client.anonymous().delete(path, headers=bearer(lan)).status_code == 204
    assert requests_of(client, lan)["outcomes"] == []


def test_outcomes_older_than_30_days_are_gone(client, house, db_url):
    lan, lan_id = lan_waiting(client, house)
    client.post(f"/api/households/{house['id']}/requests/{lan_id}/reject")
    with psycopg.connect(db_url) as conn:
        conn.execute(
            "UPDATE join_outcomes SET happened_at = now() - interval '31 days' WHERE user_id = %s",
            (lan_id,),
        )
    assert requests_of(client, lan)["outcomes"] == []


def test_a_cancelled_request_leaves_nothing(client, house):
    lan, _ = lan_waiting(client, house)
    client.anonymous().delete(f"/api/me/requests/{house['id']}", headers=bearer(lan))
    assert requests_of(client, lan) == {"pending": [], "joined": [], "outcomes": []}


def test_approve_and_refuse_at_the_same_moment_leave_exactly_one(make_client, client, house,
                                                                db_url):
    """Held together on the request row: one answer stands, and the outcome matches it."""
    lan, lan_id = lan_waiting(client, house)
    owner = f"Bearer {client.token}"
    one, two = make_client(), make_client()
    answers: list[tuple[str, int]] = []
    blocker = psycopg.connect(db_url)
    try:
        blocker.execute(
            "SELECT 1 FROM household_users WHERE household_id = %s AND user_id = %s FOR UPDATE",
            (house["id"], lan_id),
        )
        base = f"/api/households/{house['id']}/requests/{lan_id}"
        workers = [
            threading.Thread(target=lambda: answers.append(("approve", one.anonymous().post(
                f"{base}/approve", json={}, headers={"Authorization": owner}).status_code))),
            threading.Thread(target=lambda: answers.append(("reject", two.anonymous().post(
                f"{base}/reject", headers={"Authorization": owner}).status_code))),
        ]
        for w in workers:
            w.start()
        time.sleep(0.8)
        assert answers == []
        blocker.rollback()
        for w in workers:
            w.join(timeout=10)
    finally:
        blocker.close()
    won = [kind for kind, status in answers if status in (200, 204)]
    assert len(won) == 1
    body = requests_of(client, lan)
    if won == ["approve"]:
        assert body["joined"] == [house["id"]] and body["outcomes"] == []
    else:
        assert body["joined"] == [] and [o["kind"] for o in body["outcomes"]] == ["refused"]
