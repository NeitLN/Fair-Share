"""A status housemates see (specs/010-profile-page, US3): PUT /api/me/status, and who sees it."""

import pytest

from tests.api import error_code, household, member, remove_access
from tests.conftest import bearer

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]


def set_status(client, status, token=None):
    headers = bearer(token) if token else None
    return client.put("/api/me/status", json={"status": status}, headers=headers)


def statuses(client, household_id: int, token=None) -> dict[str, str | None]:
    headers = bearer(token) if token else None
    rows = client.get(f"/api/households/{household_id}/members", headers=headers).json()
    return {m["name"]: m["status"] for m in rows}


def me(client, token=None):
    return client.get("/api/auth/me", headers=bearer(token or client.token)).json()


def test_a_status_is_set_changed_and_cleared(client):
    response = set_status(client, "đang ăn kiêng 🥗")
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "đang ăn kiêng 🥗"
    assert me(client)["status"] == "đang ăn kiêng 🥗"
    assert set_status(client, "về quê").json()["status"] == "về quê"
    assert set_status(client, None).json()["status"] is None
    assert set_status(client, "   ").json()["status"] is None
    assert me(client)["status"] is None


def test_sixty_characters_is_the_limit_and_an_emoji_counts_once(client):
    assert set_status(client, "🥗" * 60).status_code == 200
    assert set_status(client, "a" * 60).status_code == 200
    too_long = set_status(client, "a" * 61)
    assert too_long.status_code == 422
    assert error_code(too_long) == "validation_error"
    assert me(client)["status"] == "a" * 60


def test_direction_controls_are_removed_and_line_breaks_refused(client):
    assert set_status(client, "‮abc⁦").json()["status"] == "abc"
    assert set_status(client, "dòng 1\ndòng 2").status_code == 422


def test_markup_is_kept_as_text(client):
    text = '<a href="x">bấm</a> **đậm**'
    assert set_status(client, text).json()["status"] == text


def test_a_status_needs_a_session(client):
    assert client.anonymous().put("/api/me/status", json={"status": "x"}).status_code == 401


def test_a_new_account_has_no_status_and_login_carries_it(client):
    token = client.sign_up(display_name="Lan", email="lan-status@test.local")
    assert me(client, token)["status"] is None
    set_status(client, "đi học", token)
    login = client.anonymous().post(
        "/api/auth/login", json={"email": "lan-status@test.local", "password": "test-password"}
    )
    assert login.json()["user"]["status"] == "đi học"


# --- Who sees it (SC-007) ----------------------------------------------------------------------


def test_housemates_see_it_in_every_household_and_strangers_do_not(client, make_client):
    a = household(client, "Nhà A")
    member(client, a["id"], "Tiến")
    lan = member(client, a["id"], "Lan")
    lan_token = client.member_tokens[lan["id"]]
    other = make_client()
    b = household(other, "Nhà B")
    member(other, b["id"], "Chủ B")
    code = other.get(f"/api/households/{b['id']}/invite").json()["code"]
    client.post("/api/join", json={"code": code}, headers=bearer(lan_token))
    lan_id = me(client, lan_token)["id"]
    other.post(f"/api/households/{b['id']}/requests/{lan_id}/approve", json={})

    set_status(client, "đang ăn kiêng 🥗", lan_token)
    assert statuses(client, a["id"]) == {"Tiến": None, "Lan": "đang ăn kiêng 🥗"}
    assert statuses(other, b["id"])["Lan"] == "đang ăn kiêng 🥗"
    stranger = client.sign_up(display_name="Người lạ")
    gone = client.get(f"/api/households/{a['id']}/members", headers=bearer(stranger))
    assert gone.status_code == 404


def test_someone_waiting_shows_no_status_even_when_sharing_another_household(client):
    a = household(client, "Nhà A")
    member(client, a["id"], "Tiến")
    lan = member(client, a["id"], "Lan")
    lan_token = client.member_tokens[lan["id"]]
    set_status(client, "đang ăn kiêng", lan_token)
    c = household(client, "Nhà C")  # the same owner, so they already share Nhà A
    member(client, c["id"], "Tiến")
    code = client.get(f"/api/households/{c['id']}/invite").json()["code"]
    client.post("/api/join", json={"code": code}, headers=bearer(lan_token))
    waiting = client.get(f"/api/households/{c['id']}/requests").json()
    assert [w["display_name"] for w in waiting] == ["Lan"]
    assert all("status" not in w for w in waiting)
    assert "Lan" not in statuses(client, c["id"])


def test_a_person_who_left_shows_none_there_but_still_in_a_shared_household(client):
    a = household(client, "Nhà A")
    member(client, a["id"], "Tiến")
    lan = member(client, a["id"], "Lan")
    lan_token = client.member_tokens[lan["id"]]
    c = household(client, "Nhà C")
    member(client, c["id"], "Tiến")
    code = client.get(f"/api/households/{c['id']}/invite").json()["code"]
    client.post("/api/join", json={"code": code}, headers=bearer(lan_token))
    lan_id = me(client, lan_token)["id"]
    client.post(f"/api/households/{c['id']}/requests/{lan_id}/approve", json={})
    set_status(client, "đang ăn kiêng", lan_token)
    left = client.post(f"/api/households/{a['id']}/leave", headers=bearer(lan_token))
    assert left.status_code == 204, left.text
    assert statuses(client, a["id"])["Lan"] is None  # the name stays in A's history
    assert statuses(client, c["id"])["Lan"] == "đang ăn kiêng"


def test_a_removed_person_shows_none_and_a_new_account_on_that_name_shows_its_own(client):
    a = household(client, "Nhà A")
    member(client, a["id"], "Tiến")
    lan = member(client, a["id"], "Lan")
    lan_token = client.member_tokens[lan["id"]]
    set_status(client, "của Lan cũ", lan_token)
    remove_access(client, a["id"], lan["id"])
    assert statuses(client, a["id"])["Lan"] is None
    gone = client.get(f"/api/households/{a['id']}/members", headers=bearer(lan_token))
    assert gone.status_code == 404

    newcomer = client.sign_up(display_name="Lan mới")
    code = client.get(f"/api/households/{a['id']}/invite").json()["code"]
    client.post("/api/join", json={"code": code}, headers=bearer(newcomer))
    newcomer_id = me(client, newcomer)["id"]
    approved = client.post(
        f"/api/households/{a['id']}/requests/{newcomer_id}/approve", json={"member_id": lan["id"]}
    )
    assert approved.status_code == 200, approved.text
    assert statuses(client, a["id"])["Lan"] is None
    set_status(client, "của người mới", newcomer)
    assert statuses(client, a["id"])["Lan"] == "của người mới"
