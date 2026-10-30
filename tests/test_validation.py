"""T-25: input limits and one error shape everywhere.

Every case here was found by sending hostile but plausible input to the API: before T-25 the text
cases were a 500 (PostgreSQL refuses NUL and broken UTF-8), `true` was stored as 1 đồng, and a
decomposed "Tiến" became a second member who looks exactly like the first.
"""

import json
import unicodedata

import pytest

from app.limits import MAX_BODY_BYTES
from app.schemas import clean_text
from tests.api import error_code, household, member

JSON = {"Content-Type": "application/json"}
NFD_TIEN = unicodedata.normalize("NFD", "Tiến")  # "e" + two combining marks: looks the same


def assert_error_shape(response, status: int, code: str) -> None:
    """The one error format: {"error": {"code", "message"}}, plus `details` on a 422 only."""
    assert response.status_code == status, response.text
    body = response.json()
    assert set(body) == {"error"}
    allowed = {"code", "message", "details"} if code == "validation_error" else {"code", "message"}
    assert {"code", "message"} <= set(body["error"]) <= allowed
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]


def post_raw(client, path: str, raw: str):
    """Send JSON text as is (json= would refuse a lone surrogate before it reached the API)."""
    return client.post(path, content=raw.encode("utf-8", "surrogatepass"),
                       headers={"Content-Type": "application/json"})


# --- Without a database -------------------------------------------------------------------


@pytest.fixture
def echo(make_client):
    """A started app with a throw-away route that reports how big the body was."""
    client = make_client(database_url=None)

    @client.app.post("/test/echo")
    async def echo_route(payload: dict):
        return {"keys": len(payload)}

    return client


def test_a_body_over_the_limit_is_413_before_it_is_read(echo):
    response = echo.post("/test/echo", content=b"{" + b" " * MAX_BODY_BYTES + b"}",
                         headers={"Content-Type": "application/json"})
    assert_error_shape(response, 413, "payload_too_large")


def test_a_chunked_body_over_the_limit_is_413_too(echo):
    """No Content-Length header (chunked), so the limit is counted while reading."""

    def chunks():
        yield b'{"pad": "'
        for _ in range(MAX_BODY_BYTES // 1024 + 1):
            yield b"x" * 1024
        yield b'"}'

    response = echo.post("/test/echo", content=chunks(), headers=JSON)
    assert_error_shape(response, 413, "payload_too_large")


def test_a_small_chunked_body_still_arrives_whole(echo):
    def chunks():
        yield b'{"a": 1, '
        yield b'"b": 2}'

    response = echo.post("/test/echo", content=chunks(), headers=JSON)
    assert response.status_code == 200
    assert response.json() == {"keys": 2}


@pytest.mark.parametrize("raw", [b'{"a": ', b"[1, 2]", b"not json"])
def test_a_body_that_is_not_a_json_object_is_422(echo, raw):
    assert_error_shape(echo.post("/test/echo", content=raw, headers=JSON), 422, "validation_error")


def test_a_validation_error_never_echoes_the_input(echo):
    secret = "do-not-echo-" + "x" * 5000
    response = echo.post("/test/echo", content=json.dumps([secret]),
                         headers={"Content-Type": "application/json"})
    assert_error_shape(response, 422, "validation_error")
    assert secret not in response.text
    assert set(response.json()["error"]["details"][0]) == {"loc", "type", "msg"}


@pytest.mark.parametrize(
    "method, path, status, code",
    [
        ("GET", "/no/such/route", 404, "not_found"),
        ("POST", "/health", 405, "method_not_allowed"),
        ("GET", "/api/households/1", 503, "database_not_configured"),
    ],
)
def test_framework_errors_use_the_one_shape(make_client, method, path, status, code):
    response = make_client(database_url=None).request(method, path)
    assert_error_shape(response, status, code)


# --- Against PostgreSQL -------------------------------------------------------------------


@pytest.fixture
def house(client) -> dict:
    created = household(client)
    created["tien"] = member(client, created["id"], "Tiến")["id"]
    created["minh"] = member(client, created["id"], "Minh")["id"]
    return created


def expense_body(house, **overrides) -> dict:
    return {
        "description": "Lẩu",
        "amount": 100_000,
        "payer_id": house["tien"],
        "spent_at": "2026-10-23",
        "split": {"type": "equal", "member_ids": [house["tien"], house["minh"]]},
        **overrides,
    }


def settlement_body(house, **overrides) -> dict:
    return {
        "from_member_id": house["minh"],
        "to_member_id": house["tien"],
        "amount": 50_000,
        "settled_at": "2026-10-24",
        **overrides,
    }


BAD_TEXT = {
    "NUL byte": "a\\u0000b",
    "lone surrogate": "a\\ud800b",
    "bell": "a\\u0007b",
    "line break inside": "Minh\\nTiến",
}
TARGETS = ["household name", "member name", "expense description", "settlement note", "ai text"]
# The AI sentence is free text: its line breaks are joined, not refused (tests/test_ai.py).
CASES = [
    pytest.param(target, bad, id=f"{target}-{name}")
    for target in TARGETS
    for name, bad in BAD_TEXT.items()
    if (target, name) != ("ai text", "line break inside")
]


@pytest.mark.db
@pytest.mark.usefixtures("cleanup")
@pytest.mark.parametrize("target, bad", CASES)
def test_control_characters_and_broken_unicode_are_422_not_500(client, house, target, bad):
    hid = house["id"]
    path, body, field = {
        "household name": ("/api/households", '{"name": "%s"}', "name"),
        "member name": (f"/api/households/{hid}/members", '{"name": "%s"}', "name"),
        "expense description": (
            f"/api/households/{hid}/expenses",
            json.dumps(expense_body(house, description="@@")).replace('"@@"', '"%s"'),
            "description",
        ),
        "settlement note": (
            f"/api/households/{hid}/settlements",
            json.dumps(settlement_body(house, note="@@")).replace('"@@"', '"%s"'),
            "note",
        ),
        "ai text": (f"/api/households/{hid}/ai/parse-expense", '{"text": "%s"}', "text"),
    }[target]
    response = post_raw(client, path, body % bad)
    assert_error_shape(response, 422, "validation_error")
    assert response.json()["error"]["details"][0]["loc"] == ["body", field]


@pytest.mark.db
@pytest.mark.usefixtures("cleanup")
def test_a_decomposed_name_is_the_same_member(client, house):
    """"Tiến" typed as e + combining marks is stored in the composed form, so it is a duplicate."""
    response = client.post(f"/api/households/{house['id']}/members", json={"name": NFD_TIEN})
    assert_error_shape(response, 409, "member_name_taken")


ZWSP = "\N{ZERO WIDTH SPACE}"
ZWJ = "\N{ZERO WIDTH JOINER}"
SOFT_HYPHEN = "\N{SOFT HYPHEN}"
# Looks like a blank, but Unicode calls it a letter, so strip() alone keeps it
HANGUL_FILLER = "\N{HANGUL FILLER}"
KIM_MIN = "\N{HANGUL SYLLABLE GIM}\N{HANGUL SYLLABLE MIN}"
FAMILY = "\N{MAN}" + ZWJ + "\N{WOMAN}" + ZWJ + "\N{GIRL}"
# A thumbs up with a skin tone, joined to the male sign: one emoji
MAN_THUMBS_UP = (
    "\N{THUMBS UP SIGN}\N{EMOJI MODIFIER FITZPATRICK TYPE-4}"
    + ZWJ
    + "\N{MALE SIGN}\N{VARIATION SELECTOR-16}"
)


@pytest.mark.parametrize(
    "typed, kept",
    [
        (ZWSP, ""),
        ("Minh" + ZWSP, "Minh"),
        ("Mi" + SOFT_HYPHEN + "nh", "Minh"),
        ("\N{ZERO WIDTH NO-BREAK SPACE}Tiến", "Tiến"),
        ("Mi" + ZWJ + "nh", "Minh"),
        (ZWJ, ""),
        (HANGUL_FILLER, ""),
        ("Minh" + HANGUL_FILLER, "Minh"),
        ("\N{HALFWIDTH HANGUL FILLER}", ""),
        ("\N{HANGUL CHOSEONG FILLER}\N{HANGUL JUNGSEONG FILLER}", ""),
        (KIM_MIN, KIM_MIN),  # real Korean is untouched
        # Between two emoji the joiner builds one picture, so it stays
        ("Nhà " + FAMILY, "Nhà " + FAMILY),
        (MAN_THUMBS_UP, MAN_THUMBS_UP),
    ],
)
def test_invisible_characters_are_removed_but_emoji_keep_their_joiner(typed, kept):
    assert clean_text(typed) == kept


@pytest.mark.db
@pytest.mark.usefixtures("cleanup")
@pytest.mark.parametrize(
    "path, name",
    [
        ("member", ZWSP),
        ("member", SOFT_HYPHEN),
        ("member", " " + ZWSP + " "),
        ("household", ZWJ),
        ("member", HANGUL_FILLER),
        ("household", "\N{HALFWIDTH HANGUL FILLER}" * 3),
    ],
)
def test_a_name_made_only_of_invisible_characters_is_422(client, house, path, name):
    url = "/api/households" if path == "household" else f"/api/households/{house['id']}/members"
    response = client.post(url, json={"name": name})
    assert_error_shape(response, 422, "validation_error")
    assert response.json()["error"]["details"][0]["loc"] == ["body", "name"]


@pytest.mark.db
@pytest.mark.usefixtures("cleanup")
@pytest.mark.parametrize(
    "lookalike", ["Minh" + ZWSP, ZWSP + "Minh", "Mi" + SOFT_HYPHEN + "nh", "Minh" + HANGUL_FILLER]
)
def test_an_invisible_character_does_not_make_a_second_minh(client, house, lookalike):
    """The house already has Minh: the same name with an invisible character is a duplicate."""
    response = client.post(f"/api/households/{house['id']}/members", json={"name": lookalike})
    assert_error_shape(response, 409, "member_name_taken")


@pytest.mark.db
@pytest.mark.usefixtures("cleanup")
def test_an_emoji_household_name_is_stored_whole(client):
    created = household(client, "Nhà " + FAMILY)
    assert created["name"] == "Nhà " + FAMILY


@pytest.mark.db
@pytest.mark.usefixtures("cleanup")
def test_text_is_stored_composed_and_the_limit_counts_what_the_user_sees(client):
    name = "Nguyễn " * 5 + "Thị Ánh"  # 42 composed characters: too long for a member (40)
    created = household(client, unicodedata.normalize("NFD", "Nhà Nguyễn Thị Ánh"))
    assert created["name"] == "Nhà Nguyễn Thị Ánh"
    assert unicodedata.is_normalized("NFC", created["name"])
    # 37 characters as the user sees them, but 50+ in decomposed form: still allowed
    long_ok = unicodedata.normalize("NFD", "Nguyễn Thị Ánh Tuyết Hoàng Phương Lê")
    assert len(long_ok) > 40
    assert member(client, created["id"], long_ok)["name"] == unicodedata.normalize("NFC", long_ok)
    too_long = client.post(f"/api/households/{created['id']}/members", json={"name": name})
    assert too_long.status_code == 422


@pytest.mark.db
@pytest.mark.usefixtures("cleanup")
@pytest.mark.parametrize(
    "field, value",
    [
        ("amount", True),
        ("amount", "100000"),
        ("amount", 100000.5),
        ("payer_id", True),
        ("payer_id", "1"),
        ("split", {"type": "equal", "member_ids": [True]}),
        ("split", {"type": "custom", "shares": [{"member_id": 1, "amount": "100000"}]}),
    ],
)
def test_numbers_must_be_json_numbers(client, house, field, value):
    """`true` used to be stored as 1 đồng (or member 1); strings and fractions were converted."""
    response = client.post(f"/api/households/{house['id']}/expenses",
                           json=expense_body(house, **{field: value}))
    assert_error_shape(response, 422, "validation_error")


@pytest.mark.db
@pytest.mark.usefixtures("cleanup")
@pytest.mark.parametrize("field", ["from_member_id", "to_member_id", "amount"])
def test_settlement_numbers_must_be_json_numbers(client, house, field):
    response = client.post(f"/api/households/{house['id']}/settlements",
                           json=settlement_body(house, **{field: True}))
    assert_error_shape(response, 422, "validation_error")


@pytest.mark.db
@pytest.mark.usefixtures("cleanup")
@pytest.mark.parametrize("day, status", [
    ("1999-12-31", 422), ("2000-01-01", 201), ("2099-12-31", 201), ("2100-01-01", 422),
])
def test_dates_must_be_between_2000_and_2099(client, house, day, status):
    expense = client.post(f"/api/households/{house['id']}/expenses",
                          json=expense_body(house, spent_at=day))
    settlement = client.post(f"/api/households/{house['id']}/settlements",
                             json=settlement_body(house, settled_at=day))
    assert (expense.status_code, settlement.status_code) == (status, status)


@pytest.mark.db
@pytest.mark.usefixtures("cleanup")
def test_every_api_error_uses_the_one_shape(client, house):
    hid, tien, minh = house["id"], house["tien"], house["minh"]
    client.post(f"/api/households/{hid}/expenses", json=expense_body(house))
    checks = [
        (client.get("/api/households/999999999"), 404, "household_not_found"),
        (client.patch("/api/members/999999999", json={"name": "X"}), 404, "member_not_found"),
        (client.get("/api/expenses/999999999"), 404, "expense_not_found"),
        (client.delete("/api/settlements/999999999"), 404, "settlement_not_found"),
        (client.post(f"/api/households/{hid}/members", json={"name": "minh"}), 409,
         "member_name_taken"),
        (client.delete(f"/api/members/{tien}"), 409, "member_in_use"),
        (client.post("/api/households", json={"name": ""}), 422, "validation_error"),
        (client.post(f"/api/households/{hid}/expenses", json=expense_body(
            house, split={"type": "custom", "shares": [{"member_id": tien, "amount": 1}]})),
         422, "split_mismatch"),
        (client.post(f"/api/households/{hid}/settlements",
                     json=settlement_body(house, to_member_id=minh)), 422, "same_member"),
    ]
    for response, status, code in checks:
        assert_error_shape(response, status, code)
    assert error_code(checks[0][0]) == "household_not_found"
