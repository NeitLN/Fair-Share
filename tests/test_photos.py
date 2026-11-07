"""Profile photos through the API (specs/010-profile-page, US4): upload, replace, remove, limits,
and who can get one."""

import base64
import io
import random

import psycopg
import pytest
from PIL import Image

from app.routers import me
from tests.api import error_code, household, member, remove_access
from tests.conftest import bearer

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]


def picture(colour=(200, 40, 40), size=(256, 256), kind="PNG") -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, colour).save(out, kind)
    return out.getvalue()


def upload(client, data=None, token=None, content_type="image/png", headers=None):
    sent = {"Content-Type": content_type, **(headers or {})}
    if token:
        sent.update(bearer(token))
    return client.put("/api/me/photo", content=data or picture(), headers=sent)


def mine(client, token=None):
    headers = bearer(token) if token else None
    return client.get("/api/me/photo", headers=headers)


def photos_of(client, household_id: int, token=None):
    headers = bearer(token) if token else None
    return client.get(f"/api/households/{household_id}/photos", headers=headers)


def versions(client, household_id: int, token=None) -> dict[str, str | None]:
    headers = bearer(token) if token else None
    rows = client.get(f"/api/households/{household_id}/members", headers=headers).json()
    return {m["name"]: m["photo_version"] for m in rows}


def test_a_photo_is_stored_as_the_servers_own_jpeg(client):
    response = upload(client)
    assert response.status_code == 200, response.text
    version = response.json()["version"]
    assert len(version) == 12
    got = mine(client)
    assert got.headers["Cache-Control"] == "no-store"
    body = got.json()
    assert body["version"] == version
    assert body["data"].startswith("data:image/jpeg;base64,")
    image = Image.open(io.BytesIO(base64.b64decode(body["data"].split(",", 1)[1])))
    assert (image.format, image.size) == ("JPEG", (256, 256))


def test_a_new_photo_replaces_the_old_one_and_removing_it_leaves_nothing(client, db_url):
    first = upload(client, picture((200, 40, 40))).json()["version"]
    second = upload(client, picture((40, 40, 200))).json()["version"]
    assert first != second
    assert mine(client).json()["version"] == second
    with psycopg.connect(db_url) as conn:
        user_id = client.get("/api/auth/me", headers=bearer(client.token)).json()["id"]
        count = conn.execute(
            "SELECT count(*) FROM user_photos WHERE user_id = %s", (user_id,)
        ).fetchone()[0]
    assert count == 1
    assert client.delete("/api/me/photo").status_code == 204
    assert mine(client).json() == {"version": None, "data": None}
    assert client.delete("/api/me/photo").status_code == 204  # none left: still fine


@pytest.mark.parametrize(
    ("data", "content_type"),
    [
        (b'<svg xmlns="http://www.w3.org/2000/svg"></svg>', "image/svg+xml"),
        (b"not a picture at all", "image/jpeg"),
        (picture(size=(600, 600)), "image/png"),
    ],
)
def test_anything_else_is_refused_and_the_old_photo_stays(client, data, content_type):
    kept = upload(client).json()["version"]
    refused = upload(client, data, content_type=content_type)
    assert refused.status_code == 415
    assert error_code(refused) == "unsupported_image"
    assert mine(client).json()["version"] == kept


def test_a_body_over_the_app_limit_is_refused(client):
    refused = upload(client, b"\x89PNG\r\n\x1a\n" + b"0" * (64 * 1024))
    assert refused.status_code == 413


def test_ten_uploads_an_hour_per_account_and_failures_count(client):
    token = client.sign_up(display_name="Lan")
    for _ in range(me.PHOTO_PER_USER - 1):
        assert upload(client, token=token).status_code == 200
    assert upload(client, b"nope", token=token, content_type="image/png").status_code == 415
    limited = upload(client, token=token)
    assert limited.status_code == 429
    assert error_code(limited) == "too_many_attempts"


def test_uploads_per_address_are_limited_too(make_client, monkeypatch):
    client = make_client(forwarded_hops=1)
    monkeypatch.setattr(me, "PHOTO_PER_IP", 2)
    # A fresh address each run: the counts of an earlier run stay in the hour's window
    ip = {"X-Forwarded-For": f"198.51.100.{random.randint(1, 250)}"}
    first, second = client.sign_up(display_name="A"), client.sign_up(display_name="B")
    assert upload(client, token=first, headers=ip).status_code == 200
    assert upload(client, token=second, headers=ip).status_code == 200
    assert upload(client, token=first, headers=ip).status_code == 429
    another = {"X-Forwarded-For": f"203.0.113.{random.randint(1, 250)}"}
    assert upload(client, token=first, headers=another).status_code == 200


def test_a_full_storage_refuses_new_photos_and_keeps_the_old_one(client, monkeypatch):
    kept = upload(client).json()["version"]
    monkeypatch.setattr(me, "PHOTO_STORAGE_BYTES", 0)
    full = upload(client, picture((40, 200, 40)))
    assert full.status_code == 507
    assert error_code(full) == "photo_storage_full"
    assert mine(client).json()["version"] == kept
    assert client.get("/api/households").status_code == 200  # everything else still works


def test_photo_routes_need_a_session(client):
    anonymous = client.anonymous()
    png = {"Content-Type": "image/png"}
    assert anonymous.put("/api/me/photo", content=picture(), headers=png).status_code == 401
    assert anonymous.get("/api/me/photo").status_code == 401
    assert anonymous.delete("/api/me/photo").status_code == 401


# --- Who can get a photo (SC-007) --------------------------------------------------------------


def test_housemates_get_photos_in_one_answer_and_strangers_get_nothing(client):
    house = household(client, "Nhà A")
    member(client, house["id"], "Tiến")
    lan = member(client, house["id"], "Lan")
    lan_token = client.member_tokens[lan["id"]]
    version = upload(client, token=lan_token).json()["version"]
    assert versions(client, house["id"]) == {"Tiến": None, "Lan": version}
    batch = client.get(f"/api/households/{house['id']}/photos")
    assert batch.headers["Cache-Control"] == "no-store"
    photos = batch.json()["photos"]
    assert [(p["member_id"], p["version"]) for p in photos] == [(lan["id"], version)]
    assert photos[0]["data"].startswith("data:image/jpeg;base64,")
    stranger = client.sign_up(display_name="Người lạ")
    assert photos_of(client, house["id"], stranger).status_code == 404


def test_someone_waiting_gets_no_photos_and_shows_none(client):
    house = household(client, "Nhà A")
    member(client, house["id"], "Tiến")
    upload(client)  # the owner has a photo
    waiting = client.sign_up(display_name="Chờ")
    upload(client, token=waiting)
    code = client.get(f"/api/households/{house['id']}/invite").json()["code"]
    client.post("/api/join", json={"code": code}, headers=bearer(waiting))
    assert photos_of(client, house["id"], waiting).status_code == 404
    shown = photos_of(client, house["id"]).json()["photos"]
    assert [p["member_id"] for p in shown] == [house["member_id"]]


def test_a_removed_person_loses_access_and_their_photo_leaves_that_household(client):
    house = household(client, "Nhà A")
    member(client, house["id"], "Tiến")
    lan = member(client, house["id"], "Lan")
    lan_token = client.member_tokens[lan["id"]]
    upload(client, token=lan_token)
    remove_access(client, house["id"], lan["id"])
    assert versions(client, house["id"])["Lan"] is None
    assert client.get(f"/api/households/{house['id']}/photos").json()["photos"] == []
    gone = client.get(f"/api/households/{house['id']}/photos", headers=bearer(lan_token))
    assert gone.status_code == 404


def test_a_person_who_left_one_household_keeps_their_photo_in_another(client):
    a = household(client, "Nhà A")
    member(client, a["id"], "Tiến")
    lan = member(client, a["id"], "Lan")
    lan_token = client.member_tokens[lan["id"]]
    c = household(client, "Nhà C")
    member(client, c["id"], "Tiến")
    code = client.get(f"/api/households/{c['id']}/invite").json()["code"]
    client.post("/api/join", json={"code": code}, headers=bearer(lan_token))
    lan_id = client.get("/api/auth/me", headers=bearer(lan_token)).json()["id"]
    client.post(f"/api/households/{c['id']}/requests/{lan_id}/approve", json={})
    version = upload(client, token=lan_token).json()["version"]
    client.post(f"/api/households/{a['id']}/leave", headers=bearer(lan_token))
    assert versions(client, a["id"])["Lan"] is None
    assert versions(client, c["id"])["Lan"] == version


def test_a_new_account_on_an_old_name_never_shows_the_old_photo(client):
    house = household(client, "Nhà A")
    member(client, house["id"], "Tiến")
    lan = member(client, house["id"], "Lan")
    upload(client, token=client.member_tokens[lan["id"]])
    remove_access(client, house["id"], lan["id"])
    newcomer = client.sign_up(display_name="Lan mới")
    code = client.get(f"/api/households/{house['id']}/invite").json()["code"]
    client.post("/api/join", json={"code": code}, headers=bearer(newcomer))
    newcomer_id = client.get("/api/auth/me", headers=bearer(newcomer)).json()["id"]
    approve = f"/api/households/{house['id']}/requests/{newcomer_id}/approve"
    client.post(approve, json={"member_id": lan["id"]})
    assert versions(client, house["id"])["Lan"] is None
    assert client.get(f"/api/households/{house['id']}/photos").json()["photos"] == []
