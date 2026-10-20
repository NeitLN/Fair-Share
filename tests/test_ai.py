"""POST /api/households/{id}/ai/parse-expense against a real database and a fake Gemini."""

import pytest

from app.routers.ai import get_gemini
from app.services.gemini import ExpenseDraft as Found
from app.services.gemini import ai_rate_limited, ai_unavailable, ai_unparseable
from tests.api import error_code, household, member

pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]


class FakeGemini:
    """Stands in for GeminiClient: records the call, answers or raises."""

    def __init__(self, answer=None, raises=None, configured=True):
        self.answer, self.raises, self.configured = answer, raises, configured
        self.calls = []

    def parse_expense(self, text, member_names, today):
        self.calls.append({"text": text, "members": member_names, "today": today})
        if self.raises:
            raise self.raises
        return self.answer


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
    assert response.status_code == 503 and error_code(response) == "ai_unavailable"
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
