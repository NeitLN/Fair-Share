"""POST /api/households/{id}/ai/parse-expense against a real database and a fake Gemini."""

import pytest

from app.routers.ai import get_gemini
from app.services.gemini import ExpenseDraft as Found
from app.services.gemini import GeminiBusy, ai_rate_limited, ai_unavailable, ai_unparseable
from tests.api import error_code, household, member

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]


class FakeGemini:
    """Stands in for GeminiClient: records the call, answers or raises. `raises` is one error for
    every call, or a list: one per call (None = answer), then the answer."""

    def __init__(self, answer=None, raises=None, configured=True):
        self.answer, self.raises, self.configured = answer, raises, configured
        self.timeout = 20.0
        self.calls = []

    def parse_expense(self, text, member_names, today, timeout=None):
        self.calls.append(
            {"text": text, "members": member_names, "today": today, "timeout": timeout}
        )
        error = self.raises
        if isinstance(error, list):
            error = error[len(self.calls) - 1] if len(self.calls) <= len(error) else None
        if error:
            raise error
        return self.answer


@pytest.fixture(autouse=True)
def no_pause(monkeypatch):
    monkeypatch.setattr("app.routers.ai.pause", lambda: None)


DINNER = Found(
    description="Dinner", amount=240_000, payer="Minh", everyone=True, spent_at="2026-10-20"
)


@pytest.fixture
def house(client):
    created = household(client)
    created["members"] = [
        member(client, created["id"], name) for name in ("Tiến", "Minh", "Duy Anh")
    ]
    return created


def use(client, fake):
    client.app.dependency_overrides[get_gemini] = lambda: fake
    return fake


def parse(client, house_id, text="dinner 240k, Minh paid, split 3 ways", ip=None):
    headers = {"X-Forwarded-For": ip} if ip else {}
    return client.post(
        f"/api/households/{house_id}/ai/parse-expense", json={"text": text}, headers=headers
    )


def test_a_sentence_becomes_a_draft_that_can_be_saved_as_it_is(client, house):
    fake = use(client, FakeGemini(DINNER))
    response = parse(client, house["id"])
    assert response.status_code == 200, response.text
    body = response.json()
    ids = [m["id"] for m in house["members"]]
    assert body["warnings"] == []
    assert body["draft"] == {
        "description": "Dinner",
        "amount": 240000,
        "payer_id": ids[1],
        "spent_at": "2026-10-20",
        "source": "ai",
        "split": {"type": "equal", "member_ids": ids},
    }
    assert fake.calls[0]["members"] == ["Tiến", "Minh", "Duy Anh"]
    # Nothing was saved...
    assert client.get(f"/api/households/{house['id']}/expenses").json() == []
    # ...and the draft is a valid expense once the user presses Save.
    saved = client.post(f"/api/households/{house['id']}/expenses", json=body["draft"])
    assert saved.status_code == 201, saved.text
    assert saved.json()["source"] == "ai"


@pytest.mark.parametrize(
    "pasted",
    [
        "lẩu 240k\nMinh trả chia đều",  # a two-line message pasted from Zalo
        "lẩu 240k\r\nMinh trả chia đều",  # Windows line ending
        "lẩu 240k\tMinh trả\n\n  chia đều  ",  # Shift+Enter, a tab, extra spaces
    ],
)
def test_a_multi_line_sentence_reaches_the_ai_as_one_line(client, house, pasted):
    """Found by Duy Anh on #107: refusing line breaks (as in names) broke pasted chat messages."""
    fake = use(client, FakeGemini(DINNER))
    response = parse(client, house["id"], text=pasted)
    assert response.status_code == 200, response.text
    assert fake.calls[0]["text"] == "lẩu 240k Minh trả chia đều"


def test_other_control_characters_in_the_ai_sentence_are_still_refused(client, house):
    fake = use(client, FakeGemini(DINNER))
    response = parse(client, house["id"], text="lẩu 240k\u0000")
    assert response.status_code == 422
    assert error_code(response) == "validation_error"
    assert fake.calls == []  # refused before any quota is used


def test_unknown_names_are_reported_not_guessed(client, house):
    use(
        client,
        FakeGemini(
            Found(description="Taxi", amount=80_000, payer="Hùng", participants=["tien", "Duy"])
        ),
    )
    body = parse(client, house["id"], "taxi 80k Hùng trả, Tiến với Duy").json()
    ids = [m["id"] for m in house["members"]]
    assert body["draft"]["payer_id"] is None
    assert body["draft"]["split"]["member_ids"] == [ids[0], ids[2]]
    assert [(w["code"], w["name"]) for w in body["warnings"]] == [("unknown_member", "Hùng")]


def test_no_key_is_503_and_gemini_is_not_called(client, house):
    fake = use(client, FakeGemini(configured=False))
    response = parse(client, house["id"])
    assert response.status_code == 503 and error_code(response) == "ai_not_configured"
    assert fake.calls == []


@pytest.mark.parametrize(
    "error, status, code",
    [
        (ai_rate_limited(), 429, "ai_rate_limited"),
        (ai_unavailable(), 503, "ai_unavailable"),
        (ai_unparseable(), 422, "ai_unparseable"),
    ],
)
def test_gemini_failures_reach_the_page_as_error_codes(client, house, error, status, code):
    use(client, FakeGemini(raises=error))
    response = parse(client, house["id"])
    assert response.status_code == status and error_code(response) == code


def test_the_sixth_request_in_a_minute_from_one_ip_is_429(client, house):
    fake = use(client, FakeGemini(DINNER))
    assert all(parse(client, house["id"], ip="203.0.113.7").status_code == 200 for _ in range(5))
    response = parse(client, house["id"], ip="203.0.113.7")
    assert response.status_code == 429 and error_code(response) == "ai_rate_limited"
    assert len(fake.calls) == 5  # Gemini was not called the 6th time
    assert parse(client, house["id"], ip="198.51.100.2").status_code == 200


def test_a_made_up_forwarded_address_does_not_dodge_the_limit(client, house):
    use(client, FakeGemini(DINNER))
    for i in range(5):
        parse(client, house["id"], ip=f"10.9.9.{i}, 203.0.113.8")  # last entry: Render's view
    response = parse(client, house["id"], ip="10.9.9.99, 203.0.113.8")
    assert response.status_code == 429


def test_unknown_household_is_404(client):
    use(client, FakeGemini(DINNER))
    assert error_code(parse(client, 2**62)) == "household_not_found"


def test_a_household_without_members_is_409(client):
    use(client, FakeGemini(DINNER))
    empty = household(client, "Nhà trống")
    response = parse(client, empty["id"])
    assert response.status_code == 409 and error_code(response) == "no_members"


@pytest.mark.parametrize("text", ["", "   ", "x" * 301])
def test_empty_or_too_long_text_is_422_before_anything_else(client, house, text):
    fake = use(client, FakeGemini(DINNER))
    response = client.post(f"/api/households/{house['id']}/ai/parse-expense", json={"text": text})
    assert response.status_code == 422 and error_code(response) == "validation_error"
    assert fake.calls == []


def test_a_momentary_5xx_is_tried_once_more(client, house):
    fake = use(client, FakeGemini(DINNER, raises=[GeminiBusy()]))
    response = parse(client, house["id"])
    assert response.status_code == 200, response.text
    assert len(fake.calls) == 2
    # the retry only gets what is left of the 20 s, so the wait stays about AI_TIMEOUT
    assert fake.calls[0]["timeout"] is None and 1.0 <= fake.calls[1]["timeout"] <= 20.0


def test_never_more_than_one_retry(client, house):
    fake = use(client, FakeGemini(DINNER, raises=[GeminiBusy(), GeminiBusy()]))
    response = parse(client, house["id"])
    assert response.status_code == 503 and error_code(response) == "ai_unavailable"
    assert len(fake.calls) == 2


@pytest.mark.parametrize("error", [ai_unavailable(), ai_rate_limited(), ai_unparseable()])
def test_timeouts_429s_and_bad_answers_are_not_retried(client, house, error):
    fake = use(client, FakeGemini(DINNER, raises=[error]))
    parse(client, house["id"])
    assert len(fake.calls) == 1


def test_a_retry_is_skipped_when_the_global_budget_is_spent(client, house):
    fake = use(client, FakeGemini(DINNER, raises=[None] * 9 + [GeminiBusy(), GeminiBusy()]))
    for i in range(9):  # 9 visitors answered: one slot of the global 10/min is left
        assert parse(client, house["id"], ip=f"198.51.100.{i}").status_code == 200
    response = parse(client, house["id"], ip="198.51.100.99")  # takes the last slot, then a 5xx
    assert response.status_code == 503 and error_code(response) == "ai_unavailable"
    assert len(fake.calls) == 10  # no retry: it would have been the 11th call this minute


def test_a_slow_5xx_is_not_retried(client, house, monkeypatch):
    monkeypatch.setattr("app.routers.ai.RETRY_IF_FAILED_WITHIN", -1.0)  # every failure is "slow"
    fake = use(client, FakeGemini(DINNER, raises=[GeminiBusy()]))
    assert parse(client, house["id"]).status_code == 503
    assert len(fake.calls) == 1


def test_proxy_settings_decide_who_the_visitor_is(make_client):
    client = make_client(forwarded_hops=3)  # as on Render
    house = household(client)
    member(client, house["id"], "Minh")
    use(client, FakeGemini(DINNER))
    # a different made-up prefix and different proxy entries each time; same visitor
    for i in range(5):
        parse(client, house["id"], ip=f"10.9.9.{i}, 198.51.100.7, 172.70.1.{i}, 10.201.0.{i}")
    response = parse(client, house["id"], ip="10.9.9.99, 198.51.100.7, 172.70.1.99, 10.201.0.99")
    assert response.status_code == 429
    assert parse(client, house["id"], ip="198.51.100.8, 172.70.1.5, 10.201.0.5").status_code == 200
