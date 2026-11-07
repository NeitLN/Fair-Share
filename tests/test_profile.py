"""The profile page's account routes (specs/010-profile-page): PATCH /api/me renames the person
everywhere, POST /api/me/password changes the password and ends the other sessions."""

import uuid

import psycopg
import pytest

from app.routers import accounts, me
from tests.api import error_code, household, member
from tests.conftest import bearer

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]

PASSWORD = "test-password"  # what AuthedClient.sign_up uses


def me_of(client) -> dict:
    """/api/auth/me is an open path for the test client, so its token goes in by hand."""
    return client.get("/api/auth/me", headers=bearer(client.token)).json()


def names_of(client, household_id: int) -> dict[int, str]:
    rows = client.get(f"/api/households/{household_id}/members").json()
    return {m["id"]: m["name"] for m in rows}


def rename(client, name, token=None):
    headers = bearer(token) if token else None
    return client.patch("/api/me", json={"display_name": name}, headers=headers)


def two_households(client, make_client):
    """Lan owns A and is a member of B (B belongs to someone else)."""
    a = household(client, "Nhà A")
    lan_a = member(client, a["id"], "Lan")  # the owner's own name, renamed to Lan
    other = make_client()
    b = household(other, "Nhà B")
    member(other, b["id"], "Chủ B")
    code = other.get(f"/api/households/{b['id']}/invite").json()["code"]
    client.post("/api/join", json={"code": code})
    lan_id = me_of(client)["id"]
    lan_b = other.post(f"/api/households/{b['id']}/requests/{lan_id}/approve", json={}).json()
    return a, lan_a, b, lan_b, other


# --- Rename (US1) ------------------------------------------------------------------------------


def test_a_new_name_reaches_the_account_and_every_household(client, make_client):
    a, lan_a, b, lan_b, other = two_households(client, make_client)
    response = rename(client, "Ngọc Lan")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["kept"] == []
    assert body["user"]["display_name"] == "Ngọc Lan"
    assert me_of(client)["display_name"] == "Ngọc Lan"
    assert names_of(client, a["id"])[lan_a["id"]] == "Ngọc Lan"
    assert names_of(other, b["id"])[lan_b["id"]] == "Ngọc Lan"


def test_a_household_where_the_name_is_taken_keeps_the_old_one_and_says_so(client, make_client):
    a, lan_a, b, lan_b, other = two_households(client, make_client)
    member(other, b["id"], "ngọc lan")  # someone else in B, other case
    body = rename(client, "Ngọc Lan").json()
    kept = {"household_id": b["id"], "household_name": "Nhà B", "name": lan_b["name"]}
    assert body["kept"] == [kept]
    assert body["user"]["display_name"] == "Ngọc Lan"
    assert names_of(client, a["id"])[lan_a["id"]] == "Ngọc Lan"
    assert names_of(other, b["id"])[lan_b["id"]] == lan_b["name"]


def test_a_name_from_before_accounts_counts_as_someone_else(client, db_url):
    a = household(client, "Nhà A")
    lan = member(client, a["id"], "Lan")
    with psycopg.connect(db_url) as conn:  # a name nobody's account uses, as old households have
        conn.execute("INSERT INTO members (household_id, name) VALUES (%s, 'Bích')", (a["id"],))
    body = rename(client, "BÍCH").json()
    assert [k["household_id"] for k in body["kept"]] == [a["id"]]
    assert names_of(client, a["id"])[lan["id"]] == "Lan"


def test_a_household_still_waiting_for_approval_is_not_touched(client, make_client):
    a = household(client, "Nhà A")
    member(client, a["id"], "Lan")
    other = make_client()
    c = household(other, "Nhà C")
    member(other, c["id"], "Chủ C")
    code = other.get(f"/api/households/{c['id']}/invite").json()["code"]
    client.post("/api/join", json={"code": code})
    body = rename(client, "Ngọc Lan").json()
    assert body["kept"] == []
    waiting = other.get(f"/api/households/{c['id']}/requests").json()
    assert [w["display_name"] for w in waiting] == ["Ngọc Lan"]
    assert sorted(names_of(other, c["id"]).values()) == ["Chủ C"]


def test_a_person_never_conflicts_with_themselves(client):
    a = household(client, "Nhà A")
    lan = member(client, a["id"], "Lan")
    rename(client, "Lan")
    body = rename(client, "LAN").json()
    assert body["kept"] == []
    assert names_of(client, a["id"])[lan["id"]] == "LAN"


def test_saving_the_same_name_brings_a_household_back_in_line(client):
    a = household(client, "Nhà A")
    lan = member(client, a["id"], "Lan")
    rename(client, "Lan")
    client.patch(f"/api/members/{lan['id']}", json={"name": "Lan A"})  # the owner's own rename
    assert rename(client, "Lan").json()["kept"] == []
    assert names_of(client, a["id"])[lan["id"]] == "Lan"


def test_no_household_only_changes_the_display_name(client):
    body = rename(client, "Chỉ mình tôi").json()
    assert body == {"user": {**body["user"], "display_name": "Chỉ mình tôi"}, "kept": []}


@pytest.mark.parametrize("bad", ["", "   ", "x" * 41, "Lan\nB"])
def test_a_bad_name_changes_nothing(client, bad):
    a = household(client, "Nhà A")
    lan = member(client, a["id"], "Lan")
    response = rename(client, bad)
    assert response.status_code == 422
    assert names_of(client, a["id"])[lan["id"]] == "Lan"
    assert me_of(client)["display_name"] == "Chủ nhà"


def test_an_unexpected_failure_leaves_everything_as_it_was(client, make_client, monkeypatch):
    a, lan_a, b, lan_b, other = two_households(client, make_client)
    monkeypatch.setattr(me, "NAME_TAKEN", "no_such_constraint")  # a conflict is now unexpected
    member(other, b["id"], "Ngọc Lan")
    assert rename(client, "Ngọc Lan").status_code == 500
    assert me_of(client)["display_name"] == "Chủ nhà"
    assert names_of(client, a["id"])[lan_a["id"]] == "Lan"


def test_renaming_needs_a_session(client):
    response = client.anonymous().patch("/api/me", json={"display_name": "Ai đó"})
    assert response.status_code == 401
    assert error_code(response) == "not_authenticated"


def test_ids_expenses_and_balances_stay(client):
    a = household(client, "Nhà A")
    lan = member(client, a["id"], "Lan")
    minh = member(client, a["id"], "Minh")
    expense = {
        "description": "Lẩu",
        "amount": 300_000,
        "payer_id": lan["id"],
        "spent_at": "2026-11-08",
        "split": {"type": "equal", "member_ids": [lan["id"], minh["id"]]},
    }
    assert client.post(f"/api/households/{a['id']}/expenses", json=expense).status_code == 201
    before = client.get(f"/api/households/{a['id']}/balances").json()
    rename(client, "Ngọc Lan")
    after = client.get(f"/api/households/{a['id']}/balances").json()
    def money(balances):
        return [(b["member_id"], b["net"]) for b in balances["balances"]]

    assert money(after) == money(before)


# --- Password (US2) ----------------------------------------------------------------------------


def account(client):
    """A fresh account signed in twice (two browsers): (email, first token, second token)."""
    email = f"{uuid.uuid4().hex}@test.local"
    first = client.sign_up(display_name="Minh", email=email)
    second = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    return email, first, second.json()["token"]


def change(client, token, current=PASSWORD, new="mat-khau-moi-1", **kwargs):
    return client.anonymous().post(
        "/api/me/password",
        json={"current_password": current, "new_password": new},
        headers={**bearer(token), **kwargs.pop("headers", {})},
        **kwargs,
    )


def login(client, email, password):
    return client.anonymous().post("/api/auth/login", json={"email": email, "password": password})


def test_a_new_password_keeps_this_session_and_ends_the_others(client):
    email, phone, laptop = account(client)
    assert change(client, phone).status_code == 204
    assert client.anonymous().get("/api/auth/me", headers=bearer(phone)).status_code == 200
    assert client.anonymous().get("/api/auth/me", headers=bearer(laptop)).status_code == 401
    assert login(client, email, PASSWORD).status_code == 401
    assert login(client, email, "mat-khau-moi-1").status_code == 200


def test_a_wrong_current_password_changes_nothing_and_does_not_sign_out(client):
    email, phone, laptop = account(client)
    response = change(client, phone, current="sai-mat-khau")
    assert response.status_code == 400
    assert error_code(response) == "wrong_password"
    assert client.anonymous().get("/api/auth/me", headers=bearer(laptop)).status_code == 200
    assert login(client, email, PASSWORD).status_code == 200


@pytest.mark.parametrize("new", ["x" * 7, "x" * 129])
def test_a_new_password_of_the_wrong_length_is_refused_and_not_counted(client, new):
    email, phone, _ = account(client)
    for _ in range(accounts.LOGIN_PER_EMAIL + 1):
        assert change(client, phone, new=new).status_code == 422
    assert change(client, phone).status_code == 204


def test_wrong_current_passwords_count_with_wrong_logins(client):
    """SC-006: the same five per email, whichever route the wrong passwords came from."""
    email, phone, _ = account(client)
    for _ in range(3):
        assert login(client, email, "sai-mat-khau").status_code == 401
    for _ in range(2):
        assert change(client, phone, current="sai-mat-khau").status_code == 400
    locked = change(client, phone)
    assert locked.status_code == 429
    assert error_code(locked) == "too_many_attempts"
    assert login(client, email, PASSWORD).status_code == 429
    assert client.anonymous().get("/api/auth/me", headers=bearer(phone)).status_code == 200


def test_wrong_current_passwords_count_per_address_too(make_client, monkeypatch):
    client = make_client(forwarded_hops=1)
    _, phone, _ = account(client)
    monkeypatch.setattr(accounts, "LOGIN_PER_IP", 3)
    ip = {"X-Forwarded-For": f"203.0.113.{uuid.uuid4().int % 250}"}
    for _ in range(3):
        assert change(client, phone, current="sai", headers=ip).status_code == 400
    assert change(client, phone, headers=ip).status_code == 429


def test_the_same_change_sent_twice_applies_once(client):
    email, phone, _ = account(client)
    assert change(client, phone).status_code == 204
    second = change(client, phone)  # the old current password again
    assert second.status_code == 400 and error_code(second) == "wrong_password"
    assert client.anonymous().get("/api/auth/me", headers=bearer(phone)).status_code == 200
    assert login(client, email, "mat-khau-moi-1").status_code == 200


def test_a_login_with_the_old_password_during_the_change_gets_no_session(client, monkeypatch):
    """B3: the login checked the old password; the change commits before the login's last step."""
    email, phone, _ = account(client)
    real = accounts.password_matches

    def check_then_change(stored, password):
        ok = real(stored, password)
        monkeypatch.setattr(accounts, "password_matches", real)
        assert change(client, phone).status_code == 204  # lands in between
        return ok

    monkeypatch.setattr(accounts, "password_matches", check_then_change)
    late = login(client, email, PASSWORD)
    assert late.status_code == 401
    assert error_code(late) == "invalid_credentials"
    assert login(client, email, "mat-khau-moi-1").status_code == 200


def test_changing_the_password_needs_a_session(client):
    response = client.anonymous().post(
        "/api/me/password", json={"current_password": PASSWORD, "new_password": "mat-khau-moi-1"}
    )
    assert response.status_code == 401
