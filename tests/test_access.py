"""Who may read or change a household (docs/ACCOUNTS.md, app/access.py).

Every route about a household's data is tried as four people: its owner, a member, someone signed
in who is not in it, and someone whose request to join is still waiting. Without a session the
answer is 401; for the last two it is the same 404 a household (or member, expense, settlement)
that does not exist gets, so ids cannot be probed. Inside the household, the table of rights in
docs/ACCOUNTS.md §2 is checked one cell at a time (403).
"""
import psycopg
import pytest

from tests.api import error_code, household, member, remove_access
from tests.conftest import bearer

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]


@pytest.fixture
def world(client) -> dict:
    """Our household (Tiến owns it, Minh is a member) with an expense and a repayment, someone
    else's household, a stranger and someone waiting to join ours."""
    ours = household(client, "Nhà của mình")
    tien = member(client, ours["id"], "Tiến")["id"]
    minh = member(client, ours["id"], "Minh")["id"]
    expense = client.post(
        f"/api/households/{ours['id']}/expenses",
        json={"description": "Lẩu", "amount": 240000, "payer_id": tien, "spent_at": "2026-10-20",
              "split": {"type": "equal", "member_ids": [tien, minh]}},
    ).json()
    settlement = client.post(  # recorded by Tiến, who received it
        f"/api/households/{ours['id']}/settlements",
        json={"from_member_id": minh, "to_member_id": tien, "amount": 50000,
              "settled_at": "2026-10-21"},
    ).json()
    stranger = client.sign_up("Người lạ")
    theirs = client.post("/api/households", json={"name": "Nhà khác"}, headers=bearer(stranger))
    waiting = client.sign_up("Lan")
    code = client.get(f"/api/households/{ours['id']}/invite").json()["code"]
    client.post("/api/join", json={"code": code}, headers=bearer(waiting))
    return {
        "ours": ours, "theirs": theirs.json(), "tien": tien, "minh": minh,
        "expense": expense["id"], "settlement": settlement["id"],
        "minh_token": client.member_tokens[minh], "stranger": stranger, "waiting": waiting,
    }


def household_routes(w):
    h = w["ours"]["id"]
    return [
        ("GET", f"/api/households/{h}", None),
        ("PATCH", f"/api/households/{h}", {"name": "Đổi tên"}),
        ("GET", f"/api/households/{h}/members", None),
        ("GET", f"/api/households/{h}/expenses", None),
        ("POST", f"/api/households/{h}/expenses",
         {"description": "Trà", "amount": 60000, "payer_id": w["tien"], "spent_at": "2026-10-22",
          "split": {"type": "equal", "member_ids": [w["tien"], w["minh"]]}}),
        ("GET", f"/api/households/{h}/settlements", None),
        ("POST", f"/api/households/{h}/settlements",
         {"from_member_id": w["minh"], "to_member_id": w["tien"], "amount": 1,
          "settled_at": "2026-10-22"}),
        ("GET", f"/api/households/{h}/balances", None),
        ("GET", f"/api/households/{h}/notices", None),
        ("PUT", f"/api/households/{h}/notices", {"to_member_id": w["minh"], "amount": 1}),
        ("DELETE", f"/api/households/{h}/notices/{w['minh']}", None),
        ("POST", f"/api/households/{h}/notices/{w['minh']}/decline", None),
        ("GET", f"/api/households/{h}/invite", None),
        ("POST", f"/api/households/{h}/invite", None),
        ("GET", f"/api/households/{h}/requests", None),
        ("POST", f"/api/households/{h}/leave", None),
        ("POST", f"/api/households/{h}/ai/parse-expense", {"text": "lẩu 240k"}),
    ]


def item_routes(w):
    expense_body = {"description": "Lẩu", "amount": 240000, "payer_id": w["tien"],
                    "spent_at": "2026-10-20", "split": {"type": "equal", "member_ids": [w["tien"]]}}
    return [
        ("PATCH", f"/api/members/{w['minh']}", {"name": "Minh Hoàng"}, "member_not_found"),
        ("GET", f"/api/expenses/{w['expense']}", None, "expense_not_found"),
        ("PUT", f"/api/expenses/{w['expense']}", expense_body, "expense_not_found"),
        ("DELETE", f"/api/expenses/{w['expense']}", None, "expense_not_found"),
        ("DELETE", f"/api/settlements/{w['settlement']}", None, "settlement_not_found"),
    ]


def send(client, method, path, body, token):
    headers = {} if token is None else bearer(token)
    return client.anonymous().request(method, path, json=body, headers=headers)


ROUTES = len(household_routes({"ours": {"id": 1}, "tien": 1, "minh": 2}))


@pytest.mark.parametrize("index", range(ROUTES))
def test_every_household_route_needs_a_member_of_that_household(client, world, index):
    method, path, body = household_routes(world)[index]
    for token in (None, "", "not-a-real-token"):
        response = send(client, method, path, body, token)
        assert response.status_code == 401, (method, path, token, response.text)
        assert error_code(response) == "not_authenticated"
    for who in ("stranger", "waiting"):
        response = send(client, method, path, body, world[who])
        assert response.status_code == 404, (method, path, who, response.text)
        assert error_code(response) == "household_not_found"


@pytest.mark.parametrize("index", range(5))
def test_members_expenses_and_settlements_need_a_member_of_their_household(client, world, index):
    method, path, body, code = item_routes(world)[index]
    assert send(client, method, path, body, None).status_code == 401
    for who in ("stranger", "waiting"):
        response = send(client, method, path, body, world[who])
        assert response.status_code == 404, (method, path, who, response.text)
        assert error_code(response) == code
    # The owner may do each of these (the AI route is left out: it needs Gemini)
    assert client.request(method, path, json=body).status_code in (200, 204)


def test_a_stranger_cannot_tell_a_household_from_one_that_does_not_exist(client, world):
    hidden = send(client, "GET", f"/api/households/{world['ours']['id']}", None, world["stranger"])
    missing = send(client, "GET", "/api/households/999999999", None, world["stranger"])
    assert hidden.status_code == missing.status_code == 404
    assert hidden.json() == missing.json()


def test_someone_waiting_sees_nothing_of_the_household_not_even_its_name(client, world):
    listed = send(client, "GET", "/api/households", None, world["waiting"]).json()
    assert listed["households"] == []
    assert [p["household_id"] for p in listed["pending"]] == [world["ours"]["id"]]
    assert world["ours"]["name"] not in str(listed)


def test_the_old_key_opens_nothing(client, world, db_url):
    with psycopg.connect(db_url) as conn:
        key = conn.execute(
            "SELECT access_key FROM households WHERE id = %s", (world["ours"]["id"],)
        ).fetchone()[0]
    response = client.anonymous().get(
        f"/api/households/{world['ours']['id']}", headers={"X-Household-Key": key}
    )
    assert response.status_code == 401


def test_quick_add_from_outside_the_household_spends_no_budget(client, world, monkeypatch):
    def spend(*args):
        pytest.fail("a request from outside the household reached the AI budget")

    monkeypatch.setattr(client.app.state.ai_budget, "try_spend", spend)
    path = f"/api/households/{world['ours']['id']}/ai/parse-expense"
    assert send(client, "POST", path, {"text": "lẩu 240k"}, None).status_code == 401
    response = send(client, "POST", path, {"text": "lẩu 240k"}, world["stranger"])
    assert response.status_code == 404
    assert error_code(response) == "household_not_found"


# Other ways of writing an id that the routes still read as that id (found in review of #138)
SPELLINGS = ("%2B{}", "%20{}", "{}%20", "{}.0", "0{}")


def respell(path: str, item_id: int, spelling: str) -> str:
    return path.replace(f"/{item_id}", "/" + spelling.format(item_id), 1)


@pytest.mark.parametrize("spelling", SPELLINGS)
def test_writing_the_id_differently_does_not_skip_the_check(client, world, spelling):
    h = world["ours"]["id"]
    routes = [(m, respell(p, h, spelling), b, "household_not_found")
              for m, p, b in household_routes(world)]
    ids = {"member_not_found": world["minh"], "expense_not_found": world["expense"],
           "settlement_not_found": world["settlement"]}
    routes += [(m, respell(p, ids[code], spelling), b, code)
               for m, p, b, code in item_routes(world)]
    routes.append(("DELETE", respell(f"/api/households/{h}", h, spelling), None,
                   "household_not_found"))
    for method, path, body, code in routes:
        response = send(client, method, path, body, world["stranger"])
        assert response.status_code == 404, (method, path, response.text)
        assert error_code(response) == code
    # Nothing was changed or deleted
    assert client.get(f"/api/households/{h}").json()["name"] == world["ours"]["name"]
    assert client.get(f"/api/expenses/{world['expense']}").status_code == 200
    # The owner reaches the household with the same spelling
    assert client.get(respell(f"/api/households/{h}", h, spelling)).status_code == 200


def test_an_invalid_id_is_still_a_422_not_a_404(client, world):
    assert client.get("/api/households/99999999999999999999").status_code == 422


def test_the_browser_may_send_its_session_from_the_web_app(make_client):
    client = make_client(allowed_origins=("https://web.example",))
    response = client.options(
        "/api/households/1",
        headers={"Origin": "https://web.example", "Access-Control-Request-Method": "GET",
                 "Access-Control-Request-Headers": "authorization"},
    )
    assert response.status_code == 200
    assert "authorization" in response.headers["access-control-allow-headers"].lower()


# --- Inside the household: the table of rights (docs/ACCOUNTS.md §2) ---------------------------


def as_minh(client, world, method, path, body=None):
    return client.request(method, path, json=body, headers=bearer(world["minh_token"]))


@pytest.mark.parametrize(
    "method, path, body",
    [
        ("PATCH", "/api/households/{h}", {"name": "Nhà của Minh"}),
        ("DELETE", "/api/households/{h}", None),
        ("POST", "/api/households/{h}/invite", None),
        ("GET", "/api/households/{h}/requests", None),
        ("POST", "/api/households/{h}/requests/{waiting}/approve", {}),
        ("POST", "/api/households/{h}/requests/{waiting}/reject", None),
        ("DELETE", "/api/households/{h}/people/{owner}", None),
        ("PATCH", "/api/members/{tien}", {"name": "Tiến Võ"}),
        ("DELETE", "/api/members/{tien}", None),
    ],
)
def test_only_the_owner_runs_the_household(client, world, method, path, body):
    me = lambda token: client.get("/api/auth/me", headers=bearer(token)).json()["id"]  # noqa: E731
    path = path.format(h=world["ours"]["id"], tien=world["tien"], waiting=me(world["waiting"]),
                       owner=me(client.token))
    response = as_minh(client, world, method, path, body)
    assert response.status_code == 403, (method, path, response.text)
    assert error_code(response) == "forbidden"
    assert client.get(f"/api/households/{world['ours']['id']}").json()["name"] == "Nhà của mình"


def test_a_member_sees_the_invite_code_but_cannot_renew_it(client, world):
    path = f"/api/households/{world['ours']['id']}/invite"
    shown = as_minh(client, world, "GET", path)
    assert shown.status_code == 200
    assert shown.json()["code"] == client.get(path).json()["code"]


def expense_body(world, payer, description="Trà sữa"):
    return {"description": description, "amount": 60000, "payer_id": payer,
            "spent_at": "2026-10-22",
            "split": {"type": "equal", "member_ids": [world["tien"], world["minh"]]}}


def test_a_member_adds_expenses_paid_by_anyone_and_changes_only_their_own(client, world):
    h = world["ours"]["id"]
    # Minh records an expense Tiến paid: allowed
    created = as_minh(client, world, "POST", f"/api/households/{h}/expenses",
                      expense_body(world, world["tien"]))
    assert created.status_code == 201
    mine = f"/api/expenses/{created.json()['id']}"
    theirs = f"/api/expenses/{world['expense']}"  # recorded by Tiến
    changed = expense_body(world, world["tien"], "Trà sữa trân châu")
    assert as_minh(client, world, "PUT", mine, changed).status_code == 200
    assert as_minh(client, world, "PUT", theirs, changed).status_code == 403
    assert as_minh(client, world, "DELETE", theirs).status_code == 403
    assert client.get(theirs).json()["description"] == "Lẩu"
    # The owner may change anyone's
    assert client.put(mine, json=expense_body(world, world["minh"])).status_code == 200
    assert as_minh(client, world, "DELETE", mine).status_code == 204


def test_only_the_person_who_received_a_repayment_records_it(client, world):
    h = world["ours"]["id"]
    to_tien = {"from_member_id": world["minh"], "to_member_id": world["tien"], "amount": 10000,
               "settled_at": "2026-10-23"}
    # Minh cannot say that he paid Tiến: only Tiến can say he received it
    response = as_minh(client, world, "POST", f"/api/households/{h}/settlements", to_tien)
    assert response.status_code == 403
    assert error_code(response) == "forbidden"
    to_minh = {**to_tien, "from_member_id": world["tien"], "to_member_id": world["minh"]}
    # The owner cannot record someone else's either
    owner = client.post(f"/api/households/{h}/settlements", json=to_minh,
                        headers=bearer(client.token))
    assert owner.status_code == 403
    received = as_minh(client, world, "POST", f"/api/households/{h}/settlements", to_minh)
    assert received.status_code == 201
    # Minh deletes only the one he recorded; the owner can delete any
    assert as_minh(client, world, "DELETE", f"/api/settlements/{world['settlement']}").status_code \
        == 403
    assert client.delete(f"/api/settlements/{received.json()['id']}").status_code == 204


def test_a_new_expense_is_only_split_between_people_with_an_account(client, world, db_url):
    """A name from before accounts that nobody has taken stays in old expenses only (M3)."""
    h = world["ours"]["id"]
    with psycopg.connect(db_url) as conn:
        old_name = conn.execute(
            "INSERT INTO members (household_id, name) VALUES (%s, 'Anh') RETURNING id", (h,)
        ).fetchone()[0]
        old_expense = conn.execute(
            "INSERT INTO expenses (household_id, description, amount, payer_id)"
            " VALUES (%s, 'Gạo', 100000, %s) RETURNING id",
            (h, old_name),
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO expense_shares (expense_id, member_id, share_amount)"
            " VALUES (%s, %s, 50000), (%s, %s, 50000)",
            (old_expense, old_name, old_expense, world["tien"]),
        )
    new = {**expense_body(world, old_name)}
    response = client.post(f"/api/households/{h}/expenses", json=new)
    assert response.status_code == 422
    assert error_code(response) == "member_without_account"
    # The old expense can still be corrected with the same people
    fixed = {"description": "Gạo ST25", "amount": 120000, "payer_id": old_name,
             "spent_at": "2026-10-01",
             "split": {"type": "equal", "member_ids": [old_name, world["tien"]]}}
    assert client.put(f"/api/expenses/{old_expense}", json=fixed).status_code == 200


def test_someone_whose_access_was_taken_away_sees_nothing_more(client, world):
    h = world["ours"]["id"]
    remove_access(client, h, world["minh"])
    response = as_minh(client, world, "GET", f"/api/households/{h}")
    assert response.status_code == 404
    # His name stays, with what he paid and owes
    names = [m["name"] for m in client.get(f"/api/households/{h}/members").json()]
    assert "Minh" in names


def test_a_member_can_leave_but_the_owner_cannot(client, world):
    h = world["ours"]["id"]
    owner = client.post(f"/api/households/{h}/leave")
    assert owner.status_code == 409
    assert error_code(owner) == "owner_cannot_leave"
    assert as_minh(client, world, "POST", f"/api/households/{h}/leave").status_code == 204
    assert as_minh(client, world, "GET", f"/api/households/{h}").status_code == 404
