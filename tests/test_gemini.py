"""The Gemini client (T-21) against a fake Gemini: no network, no key, no quota used in CI."""

import datetime as dt
import json
import logging
import urllib.error

import pytest

from app.config import Settings
from app.errors import ApiError
from app.services.gemini import MAX_TEXT, ExpenseDraft, GeminiBusy, GeminiClient

KEY = "test-key-never-logged"
TODAY = dt.date(2026, 10, 20)
MEMBERS = ["Tiến", "Minh", "Duy Anh"]


def gemini_answer(fields: dict) -> bytes:
    return json.dumps(
        {"candidates": [{"content": {"parts": [{"text": json.dumps(fields)}]}}]}
    ).encode()


class FakeGemini:
    """Records the request and answers with a fixed status/body, or raises."""

    def __init__(self, status=200, body=b"", raises=None):
        self.status, self.body, self.raises = status, body, raises
        self.calls = []

    def __call__(self, url, headers, body, timeout):
        self.calls.append(
            {"url": url, "headers": headers, "body": json.loads(body), "timeout": timeout}
        )
        if self.raises:
            raise self.raises
        return self.status, self.body


def client(fake, key=KEY):
    return GeminiClient(api_key=key, model="gemini-test", timeout=10, post=fake)


def expect_error(fn, status, code):
    with pytest.raises(ApiError) as caught:
        fn()
    assert (caught.value.status, caught.value.code) == (status, code)


def test_reads_a_dinner_into_a_draft():
    fake = FakeGemini(
        body=gemini_answer(
            {
                "description": "Dinner",
                "amount": 240000,
                "payer": "Minh",
                "participants": [],
                "everyone": True,
                "spent_at": "2026-10-20",
            }
        )
    )
    draft = client(fake).parse_expense("dinner 240k, Minh paid, split 3 ways", MEMBERS, TODAY)
    assert draft == ExpenseDraft(
        description="Dinner",
        amount=240000,
        payer="Minh",
        participants=[],
        everyone=True,
        spent_at="2026-10-20",
    )


def test_the_request_asks_for_json_with_our_schema_and_gives_context():
    fake = FakeGemini(body=gemini_answer({"description": "Rent", "amount": 1}))
    client(fake).parse_expense("rent 3tr", MEMBERS, TODAY)
    call = fake.calls[0]
    assert call["url"].endswith("/models/gemini-test:generateContent")
    assert call["timeout"] == 10
    config = call["body"]["generationConfig"]
    assert config["responseMimeType"] == "application/json"
    assert "amount" in config["responseSchema"]["properties"]
    prompt = call["body"]["contents"][0]["parts"][0]["text"]
    assert "Tiến, Minh, Duy Anh" in prompt and "2026-10-20" in prompt and "rent 3tr" in prompt


def test_the_key_goes_in_a_header_never_in_the_url():
    fake = FakeGemini(body=gemini_answer({"description": "Rent", "amount": 1}))
    client(fake).parse_expense("rent", MEMBERS, TODAY)
    assert fake.calls[0]["headers"]["x-goog-api-key"] == KEY
    assert KEY not in fake.calls[0]["url"]


def test_without_a_key_nothing_is_sent():
    fake = FakeGemini()
    expect_error(
        lambda: client(fake, key=None).parse_expense("rent", MEMBERS, TODAY), 503, "ai_unavailable"
    )
    assert fake.calls == []


@pytest.mark.parametrize("text", ["", "   ", "x" * (MAX_TEXT + 1)])
def test_empty_or_too_long_text_is_refused_before_any_call(text):
    fake = FakeGemini()
    expect_error(lambda: client(fake).parse_expense(text, MEMBERS, TODAY), 422, "validation_error")
    assert fake.calls == []


def test_quota_exceeded_is_429_and_is_not_retried():
    fake = FakeGemini(status=429, body=b'{"error": {"status": "RESOURCE_EXHAUSTED"}}')
    expect_error(lambda: client(fake).parse_expense("rent", MEMBERS, TODAY), 429, "ai_rate_limited")
    assert len(fake.calls) == 1


@pytest.mark.parametrize("status", [400, 403, 500, 503])
def test_other_gemini_errors_are_503(status):
    fake = FakeGemini(status=status, body=b"{}")
    expect_error(lambda: client(fake).parse_expense("rent", MEMBERS, TODAY), 503, "ai_unavailable")


@pytest.mark.parametrize(
    "error", [TimeoutError(), urllib.error.URLError("dns"), ConnectionResetError()]
)
def test_timeout_or_network_failure_is_503(error):
    fake = FakeGemini(raises=error)
    expect_error(lambda: client(fake).parse_expense("rent", MEMBERS, TODAY), 503, "ai_unavailable")


@pytest.mark.parametrize(
    "body",
    [
        b"not json",
        b'{"candidates": []}',
        b'{"promptFeedback": {"blockReason": "SAFETY"}}',
        json.dumps({"candidates": [{"content": {"parts": [{"text": "not json"}]}}]}).encode(),
        gemini_answer({"description": "", "amount": 5}),
        # valid JSON of the wrong shape: a 422 the form can fall back from, never a 500
        b"[]",
        b'{"promptFeedback": "x"}',
        json.dumps({"candidates": [{"content": {"parts": [{"text": "[1, 2]"}]}}]}).encode(),
        json.dumps({"candidates": [{"content": {"parts": [{"text": '"dinner"'}]}}]}).encode(),
    ],
)
def test_an_answer_we_cannot_use_is_422(body):
    fake = FakeGemini(body=body)
    expect_error(lambda: client(fake).parse_expense("rent", MEMBERS, TODAY), 422, "ai_unparseable")


def test_odd_fields_are_cleaned_not_trusted():
    fake = FakeGemini(
        body=gemini_answer(
            {
                "description": "Groceries",
                "amount": -5,
                "payer": "  ",
                "participants": ["Minh", " ", 7],
                "everyone": False,
                "spent_at": "last tuesday",
            }
        )
    )
    draft = client(fake).parse_expense("groceries", MEMBERS, TODAY)
    assert draft.amount is None  # not a positive whole number of đồng
    assert draft.payer is None
    assert draft.participants == ["Minh", "7"]
    assert draft.spent_at is None  # not a date: the form keeps today's date


def test_the_key_never_reaches_the_logs_or_a_repr(caplog):
    caplog.set_level(logging.DEBUG)
    for fake in (
        FakeGemini(status=500, body=KEY.encode()),
        FakeGemini(raises=TimeoutError()),
        FakeGemini(body=b"garbage " + KEY.encode()),
    ):
        with pytest.raises(ApiError):
            client(fake).parse_expense("rent", MEMBERS, TODAY)
    assert KEY not in caplog.text
    assert KEY not in repr(client(FakeGemini()))
    assert KEY not in repr(Settings(gemini_api_key=KEY))


def test_settings_read_the_key_and_model_from_the_environment(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", KEY)
    monkeypatch.setenv("GEMINI_MODEL", "gemini-other")
    settings = Settings.from_env()
    assert (settings.gemini_api_key, settings.gemini_model) == (KEY, "gemini-other")
    monkeypatch.delenv("GEMINI_MODEL")
    assert Settings.from_env().gemini_model == "gemini-3.5-flash-lite"


def test_proxy_hops_default_to_render_when_running_there(monkeypatch):
    monkeypatch.delenv("FORWARDED_HOPS", raising=False)
    monkeypatch.delenv("RENDER", raising=False)
    assert Settings.from_env().forwarded_hops == 1  # nginx in Docker Compose
    monkeypatch.setenv("RENDER", "true")
    assert Settings.from_env().forwarded_hops == 3  # Cloudflare + two proxies, from the logs
    monkeypatch.setenv("FORWARDED_HOPS", "0")
    assert Settings.from_env().forwarded_hops == 0
    monkeypatch.setenv("AI_TIMEOUT", "15")
    assert Settings.from_env().ai_timeout == 15.0
    monkeypatch.setenv("FORWARDED_HOPS", "-1")
    with pytest.raises(ValueError):
        Settings.from_env()
    monkeypatch.setenv("FORWARDED_HOPS", "1")
    for bad in ("0", "-5"):
        monkeypatch.setenv("AI_TIMEOUT", bad)
        with pytest.raises(ValueError):
            Settings.from_env()


def test_a_shorter_timeout_can_be_given_for_one_call():
    fake = FakeGemini(body=gemini_answer({"description": "Rent", "amount": 5}))
    gemini = client(fake)
    gemini.parse_expense("rent", MEMBERS, TODAY)
    gemini.parse_expense("rent", MEMBERS, TODAY, timeout=2.5)
    assert [call["timeout"] for call in fake.calls] == [10, 2.5]


def test_participants_given_as_a_string_are_ignored_not_split_into_letters():
    fake = FakeGemini(
        body=gemini_answer({"description": "Rent", "amount": 5, "participants": "Minh"})
    )
    assert client(fake).parse_expense("rent", MEMBERS, TODAY).participants == []


def test_a_boolean_amount_is_not_one_dong():
    fake = FakeGemini(body=gemini_answer({"description": "Rent", "amount": True}))
    assert client(fake).parse_expense("rent", MEMBERS, TODAY).amount is None


def test_the_description_fits_the_expense_api_limit():
    fake = FakeGemini(body=gemini_answer({"description": "x" * 300, "amount": 5}))
    assert len(client(fake).parse_expense("rent", MEMBERS, TODAY).description) == 120


@pytest.mark.parametrize(
    "status, busy",
    [(500, True), (502, True), (503, True), (504, True), (400, False), (403, False)],
)
def test_only_a_5xx_is_worth_another_try(status, busy):
    fake = FakeGemini(status=status, body=b"{}")
    with pytest.raises(ApiError) as caught:
        client(fake).parse_expense("rent", MEMBERS, TODAY)
    assert isinstance(caught.value, GeminiBusy) is busy
    assert caught.value.code == "ai_unavailable"
