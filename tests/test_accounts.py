"""Accounts, sessions, invite codes and approvals (docs/ACCOUNTS.md) against a real PostgreSQL.

The rule ids (A1…, J1…, M1…, L1) and the examples (E1…) are the ones of docs/ACCOUNTS.md.
"""
import random
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import psycopg
import pytest

from app.auth import token_hash
from app.routers import accounts
from tests.api import error_code, household, member
from tests.conftest import bearer

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]


def new_email() -> str:
    return f"{uuid.uuid4().hex}@test.local"


def register(client, email=None, password="mat-khau-dai", name="Tiến", **kwargs):
    body = {"email": email or new_email(), "password": password, "display_name": name}
    return client.anonymous().post("/api/auth/register", json=body, **kwargs)


def login(client, email, password="mat-khau-dai", **kwargs):
    body = {"email": email, "password": password}
    return client.anonymous().post("/api/auth/login", json=body, **kwargs)


def from_ip() -> dict[str, str]:
    """A visitor address of its own, so the per-address counters of one test never meet another's
    (they live in the database). Needs a client with forwarded_hops=1."""
    return {"X-Forwarded-For": f"10.{random.randint(0, 255)}.{random.randint(0, 255)}.7"}


# --- Registering and signing in (A1–A4) ----------------------------------------------------


def test_register_signs_in_at_once(client):
    """E1: the answer carries a session; the account sees an empty home."""
    email = new_email()
    response = register(client, email=f"  {email.upper()} ")
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == email  # trimmed and lower-cased
    assert body["user"]["display_name"] == "Tiến"
    me = client.anonymous().get("/api/auth/me", headers=bearer(body["token"]))
    assert me.json() == body["user"]
    home = client.anonymous().get("/api/households", headers=bearer(body["token"]))
    assert home.json() == {"households": [], "pending": []}


def test_one_account_per_email_ignoring_case(client):
    """E4."""
    email = new_email()
    assert register(client, email=email).status_code == 201
    again = register(client, email=email.upper())
    assert again.status_code == 409
    assert error_code(again) == "email_taken"


@pytest.mark.parametrize(
    "field, value",
    [
        ("email", "khong-co-a-cong"),
        ("email", "a@b"),
        ("email", "two words@x.vn"),
        ("password", "7-chars"),
        ("password", "x" * 129),
        ("display_name", ""),
        ("display_name", "​"),
        ("display_name", "x" * 41),
    ],
)
def test_register_checks_its_fields(client, field, value):
    body = {"email": new_email(), "password": "mat-khau-dai", "display_name": "Tiến", field: value}
    response = client.anonymous().post("/api/auth/register", json=body)
    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["loc"] == ["body", field]


def test_passwords_and_tokens_are_never_stored_as_typed(client, db_url):
    """A4: argon2id hash for the password, SHA-256 for the session token."""
    email = new_email()
    token = register(client, email=email, password="mat-khau-dai").json()["token"]
    with psycopg.connect(db_url) as conn:
        stored = conn.execute("SELECT password_hash FROM users WHERE email = %s", (email,))
        assert stored.fetchone()[0].startswith("$argon2id$")
        sessions = conn.execute("SELECT token_hash FROM sessions").fetchall()
    assert (token_hash(token),) in [(bytes(row[0]),) for row in sessions]
    assert all(token.encode() not in bytes(row[0]) for row in sessions)


def test_login_with_the_right_password_opens_a_new_session(client):
    email = new_email()
    first = register(client, email=email).json()["token"]
    response = login(client, email.upper())
    assert response.status_code == 200
    assert response.json()["token"] != first
    assert response.json()["user"]["email"] == email


def test_a_wrong_password_and_an_unknown_email_get_the_same_answer(client):
    """A2: nothing says which of the two was wrong."""
    email = new_email()
    register(client, email=email)
    wrong = login(client, email, "sai-mat-khau")
    unknown = login(client, new_email())
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert error_code(wrong) == "invalid_credentials"


def test_five_wrong_passwords_lock_that_email_for_a_while(client):
    """A2, E5: the sixth try is refused even with the right password, and says how long to wait."""
    email = new_email()
    register(client, email=email)
    for _ in range(accounts.LOGIN_PER_EMAIL):
        assert login(client, email, "sai-mat-khau").status_code == 401
    locked = login(client, email)
    assert locked.status_code == 429
    assert error_code(locked) == "too_many_attempts"
    assert 0 < locked.json()["error"]["retry_after"] <= 15 * 60
    assert locked.headers["Retry-After"] == str(locked.json()["error"]["retry_after"])


def test_one_address_trying_many_emails_is_slowed_down(make_client, monkeypatch):
    """A2: 20 wrong logins from one address, whatever the emails."""
    monkeypatch.setattr(accounts, "LOGIN_PER_IP", 3)
    client = make_client(forwarded_hops=1)
    ip = from_ip()
    for _ in range(3):
        assert login(client, new_email(), headers=ip).status_code == 401
    assert login(client, new_email(), headers=ip).status_code == 429
    assert login(client, new_email(), headers=from_ip()).status_code == 401  # another address


def at_once(calls):
    """Runs the calls in threads released together, and returns their answers in order."""
    barrier = threading.Barrier(len(calls))

    def run(call):
        barrier.wait()
        return call()

    with ThreadPoolExecutor(len(calls)) as pool:
        return list(pool.map(run, calls))


def test_wrong_passwords_at_the_same_moment_cannot_slip_past_the_limit(make_client, client):
    """Review of #166: each attempt used to read the count, then add to it after checking the
    password, so attempts at the same moment all saw 4 and all went through."""
    email = new_email()
    register(client, email=email)
    clients = [make_client() for _ in range(8)]
    answers = at_once([lambda c=c: login(c, email, "sai-mat-khau").status_code for c in clients])
    limit = accounts.LOGIN_PER_EMAIL
    assert sorted(answers) == [401] * limit + [429] * (8 - limit)


def test_a_right_password_does_not_count_against_the_limit(client):
    email = new_email()
    register(client, email=email)
    for _ in range(accounts.LOGIN_PER_EMAIL - 1):
        assert login(client, email, "sai-mat-khau").status_code == 401
    assert login(client, email).status_code == 200
    assert login(client, email, "sai-mat-khau").status_code == 401  # still the 5th wrong one
    assert login(client, email).status_code == 429


def test_a_refused_registration_does_not_spend_a_password_hash(make_client, monkeypatch):
    """Review of #166: the 64 MiB hash ran before the limit was checked."""
    monkeypatch.setattr(accounts, "REGISTER_PER_IP", 1)
    client = make_client(forwarded_hops=1)
    ip = from_ip()
    assert register(client, headers=ip).status_code == 201

    def no_hash(_password):
        pytest.fail("a refused registration hashed a password")

    monkeypatch.setattr(accounts, "hash_password", no_hash)
    assert register(client, headers=ip).status_code == 429


def test_one_address_cannot_make_endless_accounts(make_client, monkeypatch):
    monkeypatch.setattr(accounts, "REGISTER_PER_IP", 2)
    client = make_client(forwarded_hops=1)
    ip = from_ip()
    assert register(client, headers=ip).status_code == 201
    assert register(client, headers=ip).status_code == 201
    assert register(client, headers=ip).status_code == 429


def test_logout_ends_that_session_at_once(client):
    """A3, E16: the token stops working; another session of the same account goes on."""
    email = new_email()
    first = register(client, email=email).json()["token"]
    second = login(client, email).json()["token"]
    assert client.anonymous().post("/api/auth/logout", headers=bearer(first)).status_code == 204
    gone = client.anonymous().get("/api/auth/me", headers=bearer(first))
    assert gone.status_code == 401
    assert error_code(gone) == "not_authenticated"
    assert client.anonymous().get("/api/auth/me", headers=bearer(second)).status_code == 200


@pytest.mark.parametrize(
    "change",
    [
        "expires_at = now() - interval '1 second'",  # 30 days without use
        "created_at = now() - interval '91 days'",  # 90 days after the login, even if used
    ],
)
def test_an_old_session_stops_working(client, db_url, change):
    email = new_email()
    token = register(client, email=email).json()["token"]
    with psycopg.connect(db_url) as conn:
        conn.execute(f"UPDATE sessions SET {change} WHERE token_hash = %s", (token_hash(token),))
    assert client.anonymous().get("/api/auth/me", headers=bearer(token)).status_code == 401
    # The next login clears it away
    assert login(client, email).status_code == 200
    with psycopg.connect(db_url) as conn:
        left = conn.execute("SELECT 1 FROM sessions WHERE token_hash = %s", (token_hash(token),))
        assert left.fetchone() is None


def test_a_session_in_use_is_extended(client, db_url):
    """A3: 30 days from the last use, never more than 90 from the login."""
    token = register(client).json()["token"]
    with psycopg.connect(db_url) as conn:
        conn.execute(
            "UPDATE sessions SET last_used_at = now() - interval '2 days',"
            " expires_at = now() + interval '28 days' WHERE token_hash = %s",
            (token_hash(token),),
        )
    assert client.anonymous().get("/api/auth/me", headers=bearer(token)).status_code == 200
    with psycopg.connect(db_url) as conn:
        days = conn.execute(
            "SELECT extract(day FROM expires_at - now()) FROM sessions WHERE token_hash = %s",
            (token_hash(token),),
        ).fetchone()[0]
    assert days >= 29


# --- Joining with an invite code (J1–J3, D4) -----------------------------------------------


@pytest.fixture
def house(client) -> dict:
    created = household(client)
    created["code"] = client.get(f"/api/households/{created['id']}/invite").json()["code"]
    return created


def join(client, code, token):
    return client.anonymous().post("/api/join", json={"code": code}, headers=bearer(token))


def user_id(client, token) -> int:
    return client.anonymous().get("/api/auth/me", headers=bearer(token)).json()["id"]


def test_a_new_household_has_a_week_long_code_of_8_unambiguous_characters(client, house):
    invite = client.get(f"/api/households/{house['id']}/invite").json()
    assert len(invite["code"]) == 8
    assert set(invite["code"]) <= set("0123456789ABCDEFGHJKMNPQRSTVWXYZ")
    with psycopg.connect(client.app.state.settings.database_url) as conn:
        days = conn.execute(
            "SELECT extract(day FROM expires_at - now()) FROM invite_codes WHERE code = %s",
            (invite["code"],),
        ).fetchone()[0]
    assert days >= 6


def test_joining_with_a_code_waits_for_the_owner(client, house):
    """E6: lower case, spaces and a dash are fine; until approved the household stays hidden."""
    minh = client.sign_up("Minh")
    typed = f" {house['code'][:4].lower()}-{house['code'][4:].lower()} "
    response = join(client, typed, minh)
    assert response.status_code == 200
    assert response.json() == {"status": "pending", "household_id": None}
    hidden = client.anonymous().get(f"/api/households/{house['id']}", headers=bearer(minh))
    assert hidden.status_code == 404
    requests = client.get(f"/api/households/{house['id']}/requests").json()
    asking = [(r["display_name"], r["user_id"]) for r in requests]
    assert asking == [("Minh", user_id(client, minh))]


def test_a_code_copied_by_hand_reads_o_as_zero_and_i_or_l_as_one(client, house):
    code = house["code"]
    typed = code.replace("0", "o").replace("1", "l")
    assert join(client, typed, client.sign_up("Minh")).json()["status"] == "pending"


def test_asking_again_does_not_ask_twice(client, house):
    """J3."""
    minh = client.sign_up("Minh")
    join(client, house["code"], minh)
    assert join(client, house["code"], minh).json()["status"] == "pending"
    assert len(client.get(f"/api/households/{house['id']}/requests").json()) == 1


def test_a_member_using_the_code_again_is_sent_to_the_household(client, house):
    member(client, house["id"], "Tiến")  # the owner's own name
    minh = member(client, house["id"], "Minh")
    response = join(client, house["code"], client.member_tokens[minh["id"]])
    assert response.json() == {"status": "member", "household_id": house["id"]}


@pytest.mark.parametrize("code", ["ZZZZZZZZ", "1234", "", "ABCD-EFGH-IJKL"])
def test_a_wrong_code_reveals_nothing(client, house, code):
    """J1, E12."""
    response = join(client, code, client.sign_up("Minh"))
    assert response.status_code == 404
    assert error_code(response) == "invalid_code"
    assert house["name"] not in response.text
    assert client.get(f"/api/households/{house['id']}/requests").json() == []


def test_an_expired_or_renewed_code_stops_working(client, house, db_url):
    """J1, E12: a renewed code replaces the old one; an expired one is like a wrong one."""
    renewed = client.post(f"/api/households/{house['id']}/invite").json()["code"]
    assert renewed != house["code"]
    assert error_code(join(client, house["code"], client.sign_up("Minh"))) == "invalid_code"
    with psycopg.connect(db_url) as conn:
        conn.execute("UPDATE invite_codes SET expires_at = now() WHERE code = %s", (renewed,))
    assert error_code(join(client, renewed, client.sign_up("Lan"))) == "invalid_code"


def test_an_expired_code_leaves_a_member_without_one_and_gives_the_owner_a_new_one(
    client, house, db_url
):
    member(client, house["id"], "Tiến")
    minh = member(client, house["id"], "Minh")
    with psycopg.connect(db_url) as conn:
        conn.execute("UPDATE invite_codes SET expires_at = now() WHERE code = %s", (house["code"],))
    path = f"/api/households/{house['id']}/invite"
    seen_by_minh = client.get(path, headers=bearer(client.member_tokens[minh["id"]])).json()
    assert seen_by_minh == {"code": None, "expires_at": None}
    assert client.get(path).json()["code"] not in (None, house["code"])


def test_renewing_the_code_twice_at_the_same_moment_works(make_client, client, house):
    """Review of #166: the second renewal used to clash with the first one's new code (503)."""
    owner = client.token
    clients = [make_client() for _ in range(4)]
    path = f"/api/households/{house['id']}/invite"
    renew = [lambda c=c: c.post(path, headers=bearer(owner)).status_code for c in clients]
    answers = at_once(renew)
    assert answers == [200] * 4
    with psycopg.connect(client.app.state.settings.database_url) as conn:
        current = conn.execute(
            "SELECT count(*) FROM invite_codes WHERE household_id = %s AND revoked_at IS NULL",
            (house["id"],),
        ).fetchone()[0]
    assert current == 1


def test_guessing_codes_is_slowed_down(client, house):
    """J2, E13: five wrong codes a minute for one account; the right one then waits too."""
    minh = client.sign_up("Minh")
    for _ in range(accounts.JOIN_PER_USER):
        assert join(client, "ZZZZZZZZ", minh).status_code == 404
    blocked = join(client, house["code"], minh)
    assert blocked.status_code == 429
    assert error_code(blocked) == "too_many_attempts"


def test_joining_needs_a_session(client, house):
    response = client.anonymous().post("/api/join", json={"code": house["code"]})
    assert response.status_code == 401


def test_a_request_can_be_cancelled_by_the_person_who_asked(client, house):
    minh = client.sign_up("Minh")
    join(client, house["code"], minh)
    path = f"/api/me/requests/{house['id']}"
    assert client.anonymous().delete(path, headers=bearer(minh)).status_code == 204
    assert client.get(f"/api/households/{house['id']}/requests").json() == []
    assert client.anonymous().delete(path, headers=bearer(minh)).status_code == 404


# --- The owner's answer (M1–M3, E7, E8) ----------------------------------------------------


def ask(client, house, name):
    token = client.sign_up(name)
    join(client, house["code"], token)
    return token, user_id(client, token)


def test_approving_with_a_new_name(client, house):
    """E7: Minh then sees the household, with a name of his own."""
    token, minh = ask(client, house, "Minh")
    response = client.post(f"/api/households/{house['id']}/requests/{minh}/approve", json={})
    assert response.status_code == 200
    assert response.json()["name"] == "Minh"
    assert response.json()["role"] == "member"
    mine = client.anonymous().get("/api/households", headers=bearer(token)).json()
    assert [(h["id"], h["role"], h["member_id"]) for h in mine["households"]] == [
        (house["id"], "member", response.json()["id"])
    ]


def test_approving_onto_a_name_from_before_accounts_keeps_its_history(client, house, db_url):
    """E8: Duy Anh takes the old name "Anh" and the 50 000 đ it owes."""
    with psycopg.connect(db_url) as conn:
        old = conn.execute(
            "INSERT INTO members (household_id, name) VALUES (%s, 'Anh') RETURNING id",
            (house["id"],),
        ).fetchone()[0]
        expense = conn.execute(
            "INSERT INTO expenses (household_id, description, amount, payer_id)"
            " VALUES (%s, 'Gạo', 100000, %s) RETURNING id",
            (house["id"], house["member_id"]),
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO expense_shares (expense_id, member_id, share_amount)"
            " VALUES (%s, %s, 50000), (%s, %s, 50000)",
            (expense, house["member_id"], expense, old),
        )
    token, anh = ask(client, house, "Duy Anh")
    approve = f"/api/households/{house['id']}/requests/{anh}/approve"
    response = client.post(approve, json={"member_id": old})
    assert response.status_code == 200
    assert response.json() == {**response.json(), "id": old, "name": "Anh", "role": "member"}
    balances = client.anonymous().get(
        f"/api/households/{house['id']}/balances", headers=bearer(token)
    ).json()["balances"]
    assert {b["member_id"]: b["net"] for b in balances}[old] == -50_000


def test_a_name_someone_has_cannot_be_given_to_another(client, house):
    """M1."""
    _, minh = ask(client, house, "Minh")
    response = client.post(
        f"/api/households/{house['id']}/requests/{minh}/approve",
        json={"member_id": house["member_id"]},  # the owner's own
    )
    assert response.status_code == 409
    assert error_code(response) == "member_taken"


def test_rejecting_a_request(client, house):
    token, minh = ask(client, house, "Minh")
    path = f"/api/households/{house['id']}/requests/{minh}/reject"
    assert client.post(path).status_code == 204
    assert client.get(f"/api/households/{house['id']}/requests").json() == []
    assert client.anonymous().get("/api/households", headers=bearer(token)).json()["pending"] == []
    assert client.post(path).status_code == 404


def test_the_owner_sees_who_asks_by_name_and_email(client, house):
    email = new_email()
    token = register(client, email=email, name="Minh").json()["token"]
    join(client, house["code"], token)
    (request,) = client.get(f"/api/households/{house['id']}/requests").json()
    assert (request["display_name"], request["email"]) == ("Minh", email)


def test_the_owner_cannot_remove_themselves(client, house):
    owner = user_id(client, client.token)
    response = client.delete(f"/api/households/{house['id']}/people/{owner}")
    assert response.status_code == 409
    assert error_code(response) == "owner_cannot_leave"


# --- Taking over a household from before accounts (L1, E15) ----------------------------------


@pytest.fixture
def old_household(db_url) -> dict:
    with psycopg.connect(db_url) as conn:
        house = conn.execute(
            "INSERT INTO households (name) VALUES ('Nhà cũ') RETURNING id, access_key"
        ).fetchone()
        names = [
            conn.execute(
                "INSERT INTO members (household_id, name) VALUES (%s, %s) RETURNING id",
                (house[0], name),
            ).fetchone()[0]
            for name in ("Tiến", "Minh")
        ]
    return {"id": house[0], "key": house[1], "members": names}


def with_key(old) -> dict[str, str]:
    return {"X-Household-Key": old["key"]}


def test_the_old_key_shows_the_household_to_take_over(client, old_household):
    response = client.get(f"/api/households/{old_household['id']}/claim",
                          headers=with_key(old_household))
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Nhà cũ"
    assert [m["id"] for m in body["members"]] == old_household["members"]


@pytest.mark.parametrize("key", [None, "0" * 32])
def test_without_the_right_key_the_old_household_does_not_exist(client, old_household, key):
    headers = {} if key is None else {"X-Household-Key": key}
    response = client.get(f"/api/households/{old_household['id']}/claim", headers=headers)
    assert response.status_code == 404
    assert error_code(response) == "household_not_found"


def test_the_first_signed_in_person_with_the_key_becomes_the_owner(client, old_household):
    """E15: as one of the old names; after that the key only says to ask for a code."""
    h = old_household["id"]
    tien = old_household["members"][0]
    response = client.post(f"/api/households/{h}/claim", json={"member_id": tien},
                           headers=with_key(old_household))
    assert response.status_code == 204
    mine = client.get(f"/api/households/{h}").json()
    assert (mine["role"], mine["member_id"]) == ("owner", tien)

    other = client.sign_up("Minh")
    late = client.anonymous().get(f"/api/households/{h}/claim",
                                  headers={**with_key(old_household), **bearer(other)})
    assert late.status_code == 409
    assert error_code(late) == "household_has_owner"
    taken = client.anonymous().post(f"/api/households/{h}/claim", json={},
                                    headers={**with_key(old_household), **bearer(other)})
    assert taken.status_code == 409
    assert client.anonymous().get(f"/api/households/{h}", headers=bearer(other)).status_code == 404


def test_two_people_taking_over_at_the_same_moment_get_one_owner(
    make_client, client, old_household
):
    """Review of #166: the second claim used to fail on the one-owner index (500), not 409."""
    h = old_household["id"]
    people = [(make_client(), client.sign_up(name)) for name in ("Tiến", "Minh")]
    answers = at_once([
        lambda c=c, token=token, m=m: c.post(
            f"/api/households/{h}/claim", json={"member_id": m},
            headers={**with_key(old_household), **bearer(token)},
        ).status_code
        for (c, token), m in zip(people, old_household["members"][:2], strict=True)
    ])
    assert sorted(answers) == [204, 409]


def test_taking_over_with_a_new_name(client, old_household):
    h = old_household["id"]
    response = client.post(f"/api/households/{h}/claim", json={},
                           headers=with_key(old_household))
    assert response.status_code == 204
    names = [m["name"] for m in client.get(f"/api/households/{h}/members").json()]
    assert names == ["Tiến", "Minh", "Chủ nhà"]  # the client's own display name
