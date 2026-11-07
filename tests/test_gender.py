"""An optional gender (specs/010-profile-page, US5): PUT /api/me/gender, kept with the notice the
person saw, deleted with it, and seen only by current housemates."""

import psycopg
import pytest

from app.schemas import GENDER_NOTICE
from tests.api import error_code, household, member
from tests.conftest import bearer

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]


def set_gender(client, gender, token=None, notice=GENDER_NOTICE):
    headers = bearer(token) if token else None
    return client.put("/api/me/gender", json={"gender": gender, "notice": notice}, headers=headers)


def me(client, token=None):
    if token is None and client.token is None:
        client.get("/api/households")  # the test client signs up at its first request
    return client.get("/api/auth/me", headers=bearer(token or client.token)).json()


def stored(db_url, user_id):
    with psycopg.connect(db_url) as conn:
        return conn.execute(
            "SELECT gender, gender_notice, gender_set_at IS NOT NULL FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()


def genders(client, household_id: int) -> dict[str, str | None]:
    rows = client.get(f"/api/households/{household_id}/members").json()
    return {m["name"]: m["gender"] for m in rows}


def test_an_account_that_never_chose_is_not_stated(client):
    assert me(client)["gender"] is None


def test_a_gender_is_kept_with_its_notice_and_cleared_with_it(client, db_url):
    response = set_gender(client, "female")
    assert response.status_code == 200, response.text
    assert response.json()["gender"] == "female"
    user_id = me(client)["id"]
    assert stored(db_url, user_id) == ("female", GENDER_NOTICE, True)
    assert set_gender(client, None).json()["gender"] is None
    assert stored(db_url, user_id) == (None, None, False)


@pytest.mark.parametrize("value", ["nam", "Female", "", "unknown"])
def test_only_the_three_choices_or_none(client, value):
    assert set_gender(client, value).status_code == 422


def test_another_notice_version_is_refused(client):
    old = set_gender(client, "male", notice="2025-01-v0")
    assert old.status_code == 422
    assert error_code(old) == "validation_error"
    assert me(client)["gender"] is None


def test_the_database_never_keeps_a_gender_without_its_notice(client, db_url):
    user_id = me(client)["id"]
    with pytest.raises(psycopg.errors.CheckViolation), psycopg.connect(db_url) as conn:
        conn.execute("UPDATE users SET gender = 'male' WHERE id = %s", (user_id,))


def test_a_gender_needs_a_session(client):
    response = client.anonymous().put(
        "/api/me/gender", json={"gender": "male", "notice": GENDER_NOTICE}
    )
    assert response.status_code == 401


def test_signing_up_and_joining_never_ask_for_it(client):
    token = client.sign_up(display_name="Lan")  # no gender in the body, none required
    assert me(client, token)["gender"] is None


def test_housemates_see_it_and_nobody_sees_the_notice_record(client):
    house = household(client, "Nhà A")
    member(client, house["id"], "Tiến")
    lan = member(client, house["id"], "Lan")
    lan_token = client.member_tokens[lan["id"]]
    set_gender(client, "female", lan_token)
    assert genders(client, house["id"]) == {"Tiến": None, "Lan": "female"}
    raw = client.get(f"/api/households/{house['id']}/members").text
    assert "gender_notice" not in raw and "gender_set_at" not in raw and GENDER_NOTICE not in raw
    stranger = client.sign_up(display_name="Người lạ")
    assert client.get(
        f"/api/households/{house['id']}/members", headers=bearer(stranger)
    ).status_code == 404


def test_someone_waiting_or_gone_shows_none(client):
    house = household(client, "Nhà A")
    member(client, house["id"], "Tiến")
    lan = member(client, house["id"], "Lan")
    lan_token = client.member_tokens[lan["id"]]
    set_gender(client, "female", lan_token)
    waiting = client.sign_up(display_name="Chờ")
    set_gender(client, "male", waiting)
    code = client.get(f"/api/households/{house['id']}/invite").json()["code"]
    client.post("/api/join", json={"code": code}, headers=bearer(waiting))
    assert "Chờ" not in genders(client, house["id"])
    client.post(f"/api/households/{house['id']}/leave", headers=bearer(lan_token))
    assert genders(client, house["id"])["Lan"] is None
