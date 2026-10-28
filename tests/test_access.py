"""Only the holder of a household's key may read or change it (#132, app/access.py).

Every route about a household's data is tried three ways: with its own key, with no key, and with
another household's key. Without the right key the answer is the same 404 a household (or member,
expense, settlement) that does not exist gets, so ids cannot be probed.
"""
import pytest

from tests.api import error_code, household, member

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]

KEY = "X-Household-Key"


@pytest.fixture
def world(client) -> dict:
    """Two households: ours with two members, an expense and a settlement, and someone else's."""
    ours = household(client, "Nhà của mình")
    tien = member(client, ours["id"], "Tiến")["id"]
    minh = member(client, ours["id"], "Minh")["id"]
    expense = client.post(
        f"/api/households/{ours['id']}/expenses",
        json={"description": "Lẩu", "amount": 240000, "payer_id": tien, "spent_at": "2026-10-20",
              "split": {"type": "equal", "member_ids": [tien, minh]}},
    ).json()
    settlement = client.post(
        f"/api/households/{ours['id']}/settlements",
        json={"from_member_id": minh, "to_member_id": tien, "amount": 50000,
              "settled_at": "2026-10-21"},
    ).json()
    theirs = household(client, "Nhà của nhóm khác")
    return {"ours": ours, "theirs": theirs, "tien": tien, "minh": minh,
            "expense": expense["id"], "settlement": settlement["id"]}


def household_routes(w):
    h = w["ours"]["id"]
    return [
        ("GET", f"/api/households/{h}", None),
        ("PATCH", f"/api/households/{h}", {"name": "Đổi tên"}),
        ("GET", f"/api/households/{h}/members", None),
        ("POST", f"/api/households/{h}/members", {"name": "Lan"}),
        ("GET", f"/api/households/{h}/expenses", None),
        ("POST", f"/api/households/{h}/expenses",
         {"description": "Trà", "amount": 60000, "payer_id": w["tien"], "spent_at": "2026-10-22",
          "split": {"type": "equal", "member_ids": [w["tien"], w["minh"]]}}),
        ("GET", f"/api/households/{h}/settlements", None),
        ("POST", f"/api/households/{h}/settlements",
         {"from_member_id": w["minh"], "to_member_id": w["tien"], "amount": 1,
          "settled_at": "2026-10-22"}),
        ("GET", f"/api/households/{h}/balances", None),
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


def send(client, method, path, body, key):
    headers = {} if key is None else {KEY: key}
    return client.without_key().request(method, path, json=body, headers=headers)


@pytest.mark.parametrize("index", range(10))
def test_every_household_route_needs_that_household_key(client, world, index):
    method, path, body = household_routes(world)[index]
    right = world["ours"]["key"]
    almost = right[:-1] + ("1" if right.endswith("0") else "0")  # one character off
    for key in (None, "", world["theirs"]["key"], almost):
        response = send(client, method, path, body, key)
        assert response.status_code == 404, (method, path, key, response.text)
        assert error_code(response) == "household_not_found"


@pytest.mark.parametrize("index", range(5))
def test_members_expenses_and_settlements_need_their_household_key(client, world, index):
    method, path, body, code = item_routes(world)[index]
    for key in (None, world["theirs"]["key"]):
        response = send(client, method, path, body, key)
        assert response.status_code == 404, (method, path, key, response.text)
        assert error_code(response) == code
    # With the right key it works (the AI route is left out: it needs Gemini)
    assert send(client, method, path, body, world["ours"]["key"]).status_code in (200, 204)


def test_removing_a_member_needs_the_key(client, world):
    path = f"/api/members/{member(client, world['ours']['id'], 'Lan')['id']}"
    assert send(client, "DELETE", path, None, world["theirs"]["key"]).status_code == 404
    assert send(client, "DELETE", path, None, world["ours"]["key"]).status_code == 204


def test_deleting_a_household_needs_its_key(client, world):
    path = f"/api/households/{world['ours']['id']}"
    assert send(client, "DELETE", path, None, world["theirs"]["key"]).status_code == 404
    assert client.get(path).status_code == 200
    assert send(client, "DELETE", path, None, world["ours"]["key"]).status_code == 204


def test_a_wrong_key_looks_exactly_like_a_household_that_does_not_exist(client, world):
    wrong = send(client, "GET", f"/api/households/{world['ours']['id']}", None, "nope")
    missing = send(client, "GET", "/api/households/999999999", None, world["ours"]["key"])
    assert wrong.status_code == missing.status_code == 404
    assert wrong.json() == missing.json()


def test_the_key_is_only_in_the_answer_to_creating_the_household(client, world):
    h = world["ours"]["id"]
    for path in (f"/api/households/{h}", f"/api/households/{h}/members",
                 f"/api/households/{h}/expenses", f"/api/households/{h}/balances"):
        assert world["ours"]["key"] not in client.get(path).text


def test_every_household_gets_its_own_random_key(client, world):
    keys = {world["ours"]["key"], world["theirs"]["key"], household(client, "Nhà thứ ba")["key"]}
    assert len(keys) == 3
    assert all(len(key) == 32 and all(c in "0123456789abcdef" for c in key) for key in keys)


def test_quick_add_without_the_key_spends_no_budget(client, world, monkeypatch):
    def spend(*args):
        pytest.fail("a request without the key reached the AI budget")

    monkeypatch.setattr(client.app.state.ai_budget, "try_spend", spend)
    response = send(client, "POST", f"/api/households/{world['ours']['id']}/ai/parse-expense",
                    {"text": "lẩu 240k"}, None)
    assert response.status_code == 404
    assert error_code(response) == "household_not_found"


# Other ways of writing an id that the routes still read as that id (found in review of #138)
SPELLINGS = ("%2B{}", "%20{}", "{}%20", "{}.0", "0{}")


def respell(path: str, item_id: int, spelling: str) -> str:
    return path.replace(f"/{item_id}", "/" + spelling.format(item_id), 1)


@pytest.mark.parametrize("spelling", SPELLINGS)
def test_writing_the_id_differently_does_not_skip_the_key(client, world, spelling):
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
        response = send(client, method, path, body, None)
        assert response.status_code == 404, (method, path, response.text)
        assert error_code(response) == code
    # Nothing was changed or deleted
    after = client.get(f"/api/households/{h}").json()
    assert after["name"] == world["ours"]["name"]
    assert client.get(f"/api/expenses/{world['expense']}").status_code == 200
    # With the right key, the same spelling still reaches the household
    response = send(client, "GET", respell(f"/api/households/{h}", h, spelling), None,
                    world["ours"]["key"])
    assert response.status_code == 200


def test_an_invalid_id_is_still_a_422_not_a_404(client, world):
    too_big = "/api/households/99999999999999999999"
    response = send(client, "GET", too_big, None, world["ours"]["key"])
    assert response.status_code == 422


def test_the_browser_may_send_the_key_from_the_web_app(make_client):
    client = make_client(allowed_origins=("https://web.example",))
    response = client.options(
        "/api/households/1",
        headers={"Origin": "https://web.example", "Access-Control-Request-Method": "GET",
                 "Access-Control-Request-Headers": "x-household-key"},
    )
    assert response.status_code == 200
    assert "x-household-key" in response.headers["access-control-allow-headers"].lower()
