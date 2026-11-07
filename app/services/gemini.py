"""The Google Gemini client behind AI Quick add (docs/ARCHITECTURE.md §6).

One job: turn a free-text sentence such as "dinner 240k, Minh paid, split 3 ways" into a *draft*
expense. Nothing here touches the database; the endpoint (T-22) matches the names to the household's
members and the user confirms the draft before anything is saved.

Failures become ApiErrors the frontend already knows how to show (the manual form stays open):

    no key on this server                        →  503 ai_not_configured (retrying cannot help)
    timeout, network error, Gemini 5xx           →  503 ai_unavailable
    Gemini 429 (quota)                           →  429 ai_rate_limited
    blocked prompt, empty or invalid answer      →  422 ai_unparseable

This client never retries: on a 429 a retry only burns more of the free quota and makes the user
wait longer than typing the expense by hand. The route (app/routers/ai.py) retries once, and only
a 5xx that came back within a few seconds, while the global budget has room.
"""

import datetime as dt
import json
import logging
import socket
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field

from app.errors import ApiError

logger = logging.getLogger("uvicorn.error")

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MAX_TEXT = 300  # characters; longer input is refused before any call (it would only cost quota)
MAX_DESCRIPTION = 120  # the expense API's limit (app/schemas.py)

MAX_SHARE_NAME = 60  # the members API's limit for a name
MAX_SHARE_AMOUNT = 1_000_000_000_000  # app/schemas.py MAX_AMOUNT
REST_KINDS = ["none", "person", "equal"]
UNSUPPORTED = ["none", "fraction_or_percent", "several_payers", "paid_amount", "payer_not_sharing"]

# What Gemini must return: JSON matching this schema (structured output), never free-form text.
DRAFT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "description": {"type": "STRING", "description": "What was bought, short, e.g. 'Dinner'"},
        "amount": {"type": "INTEGER", "description": "Total in whole Vietnamese đồng"},
        "payer": {"type": "STRING", "description": "Name of the person who paid, as written"},
        "participants": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
            "description": "Names of the people sharing the cost; empty if everyone",
        },
        "everyone": {"type": "BOOLEAN", "description": "True if the whole household shares it"},
        "spent_at": {"type": "STRING", "description": "Date it was spent, YYYY-MM-DD"},
        # specs/009-ai-custom-split: what the sentence says about shares. The model only reports it;
        # the server works out the split (app/services/allocation.py).
        "named_amounts": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "name": {"type": "STRING", "description": "Name as written, or ME"},
                    "amount": {"type": "INTEGER", "description": "What this person owes, in đồng"},
                },
                "required": ["name", "amount"],
            },
            "description": "Amounts given to named people, in the order written; empty if none",
        },
        "rest": {
            "type": "OBJECT",
            "properties": {
                "kind": {"type": "STRING", "enum": REST_KINDS},
                "names": {"type": "ARRAY", "items": {"type": "STRING"}},
            },
            "required": ["kind", "names"],
            "description": "Who takes what is left of the total after the named amounts",
        },
        "unsupported": {"type": "STRING", "enum": UNSUPPORTED},
    },
    "required": [
        "description",
        "amount",
        "payer",
        "participants",
        "everyone",
        "spent_at",
        "named_amounts",
        "rest",
        "unsupported",
    ],
}

PROMPT = """You read one sentence about a shared household expense and return its fields as JSON.
Rules:
- amount is a whole number of Vietnamese đồng: "240k" or "240 nghìn" = 240000, "1tr2" = 1200000,
  "1,5 triệu" = 1500000. If no amount is given, use 0.
- payer and participants must be written exactly like one of these household members: {members}.
  If a name is not one of them, still return it as written.
- "split 3 ways", "chia đều", "cả nhà", "everyone" with no names means everyone = true.
- spent_at: today is {today}; "hôm qua"/"yesterday" is the day before. Default: today.
- description: 1 to 5 words, the same language as the sentence.
- named_amounts: only when the sentence gives a person an amount of their own, like "Minh 200k" or
  "Lan 100 nghìn": that is what the person owes. Keep the order written. The person typing ("mình",
  "tôi", "tao", "me", "I", "my") is written ME. An amount someone paid, put in or paid back
  ("Minh trả 200k", "Lan đưa 100k", "Minh paid 300k") is not a named amount: set unsupported to
  paid_amount, or several_payers if more than one person paid. Otherwise named_amounts is [].
- rest: only about what is left after the named amounts ("còn lại", "phần còn lại", "the rest").
  "còn lại Lan" / "rest Lan" / "còn lại mình" = kind person with that one name (ME for the speaker).
  "còn lại chia đều" / "split the rest" = kind equal, with the names after it if any. Nothing said =
  kind none, names []. "chia đều" or "split 3 ways" on its own is everyone = true, not rest.
- unsupported: fraction_or_percent for shares like "1/3" or "40%"; payer_not_sharing when the payer
  says they do not share ("trả hộ", "không ăn", "not eating"); otherwise none.
Sentence: {text}"""


def ai_not_configured() -> ApiError:
    """No GEMINI_API_KEY: a setting, not an outage, so the page disables Quick add (no retry)."""
    return ApiError(
        503,
        "ai_not_configured",
        "AI quick add is not set up on this server. Please fill in the form below.",
    )


def ai_unavailable() -> ApiError:
    return ApiError(
        503,
        "ai_unavailable",
        "AI quick add is not available right now. Please fill in the form below.",
    )


class GeminiBusy(ApiError):
    """A 5xx from Gemini: the same 503 for the page, but one more try may work."""

    def __init__(self):
        error = ai_unavailable()
        super().__init__(error.status, error.code, error.message)


def ai_rate_limited() -> ApiError:
    return ApiError(
        429,
        "ai_rate_limited",
        "AI quick add is busy right now. Please fill in the form below or try again in a minute.",
    )


def ai_unparseable() -> ApiError:
    return ApiError(
        422,
        "ai_unparseable",
        "Could not understand that sentence. Please check the fields or fill them in by hand.",
    )


@dataclass(frozen=True)
class NamedAmount:
    """'Minh 200k': what one person owes, as written (ME is the person typing)."""

    name: str
    amount: int


@dataclass(frozen=True)
class Rest:
    """Who takes what is left of the total: none (the payer), person (one name) or equal."""

    kind: str = "none"
    names: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ExpenseDraft:
    """What Gemini read from the sentence. Names are as written; T-22 matches them to members."""

    description: str
    amount: int | None
    payer: str | None
    participants: list[str] = field(default_factory=list)
    everyone: bool = False
    spent_at: str | None = None
    named_amounts: list[NamedAmount] = field(default_factory=list)
    rest: Rest = field(default_factory=Rest)
    unsupported: str = "none"
    # False when Gemini returned shares we cannot trust: the split is then blocked, never repaired
    shares_readable: bool = True


# (url, headers, body, timeout) -> (status, body). Replaced in tests, so no test needs the network.
Post = Callable[[str, dict[str, str], bytes, float], tuple[int, bytes]]


def _urllib_post(
    url: str, headers: dict[str, str], body: bytes, timeout: float
) -> tuple[int, bytes]:
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


class GeminiClient:
    def __init__(
        self, api_key: str | None, model: str, timeout: float = 20.0, post: Post = _urllib_post
    ):
        self._api_key = api_key
        self.model = model
        self.timeout = timeout
        self._post = post

    def __repr__(self) -> str:  # never the key
        return f"GeminiClient(model={self.model!r}, key={'set' if self._api_key else 'not set'})"

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    def parse_expense(
        self, text: str, member_names: list[str], today: dt.date, timeout: float | None = None
    ) -> ExpenseDraft:
        """`timeout` shortens the wait for this one call (a retry gets only the time left)."""
        timeout = self.timeout if timeout is None else timeout
        text = text.strip()
        if not text or len(text) > MAX_TEXT:
            raise ApiError(
                422, "validation_error", f"Write the expense in 1 to {MAX_TEXT} characters."
            )
        if not self._api_key:
            raise ai_not_configured()

        prompt = PROMPT.format(
            members=", ".join(member_names) or "(none yet)", today=today.isoformat(), text=text
        )
        body = json.dumps(
            {
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "responseSchema": DRAFT_SCHEMA,
                    "temperature": 0,
                },
            }
        ).encode()
        # The key goes in a header, not the URL, so it cannot end up in an access log or an error.
        headers = {"Content-Type": "application/json", "x-goog-api-key": self._api_key}
        url = ENDPOINT.format(model=self.model)
        started = time.monotonic()

        def took() -> int:
            return round((time.monotonic() - started) * 1000)

        try:
            status, raw = self._post(url, headers, body, timeout)
        except (TimeoutError, socket.timeout):
            logger.warning("gemini: no answer within %.0f s (%s)", timeout, self.model)
            raise ai_unavailable() from None
        except (urllib.error.URLError, OSError) as error:
            # urlopen wraps a timeout during connect in URLError
            if isinstance(getattr(error, "reason", None), (TimeoutError, socket.timeout)):
                logger.warning("gemini: no answer within %.0f s (%s)", timeout, self.model)
            else:
                logger.warning("gemini: network error %s after %d ms", type(error).__name__, took())
            raise ai_unavailable() from None

        if status == 429:
            logger.warning("gemini: rate limited (429) after %d ms", took())
            raise ai_rate_limited()
        if status in (500, 502, 503, 504):
            logger.warning("gemini: HTTP %s after %d ms (%s)", status, took(), self.model)
            raise GeminiBusy()
        if status != 200:
            # Status only: the body could echo the request, and the request carries the user's text.
            logger.warning("gemini: HTTP %s after %d ms (%s)", status, took(), self.model)
            raise ai_unavailable()
        logger.info("gemini: answered in %d ms (%s)", took(), self.model)
        return _read_draft(raw)


def _read_draft(raw: bytes) -> ExpenseDraft:
    try:
        answer = json.loads(raw)
        feedback = answer.get("promptFeedback") or {}
        if isinstance(feedback, dict) and feedback.get("blockReason"):
            raise ValueError("prompt blocked")
        fields = json.loads(answer["candidates"][0]["content"]["parts"][0]["text"])
        if not isinstance(fields, dict):  # e.g. a list or a bare string
            raise ValueError("answer is not a JSON object")
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        logger.warning("gemini: answer could not be read")
        raise ai_unparseable() from None

    amount = fields.get("amount")
    participants = fields.get("participants")
    # Same limit as the expense API (1-120 characters), so a draft can always be saved as it is.
    description = str(fields.get("description") or "").strip()[:MAX_DESCRIPTION]
    if not description:
        raise ai_unparseable()
    return ExpenseDraft(
        description=description,
        # type() and not isinstance(): True is an int in Python and must not become 1 đồng
        amount=amount if type(amount) is int and amount > 0 else None,
        payer=(str(fields.get("payer") or "").strip() or None),
        participants=[str(name).strip() for name in participants if str(name).strip()]
        if isinstance(participants, list)
        else [],
        everyone=bool(fields.get("everyone")),
        spent_at=_valid_date(fields.get("spent_at")),
        **_read_shares(fields),
    )


def _read_shares(fields: dict) -> dict:
    """named_amounts, rest and unsupported, all checked. One bad entry makes the whole reading of
    shares unusable: dropping it could leave a split that adds up but is not what was said."""
    unusable = {"shares_readable": False}
    named_raw = fields.get("named_amounts", [])
    rest_raw = fields.get("rest", {"kind": "none", "names": []})
    unsupported = fields.get("unsupported", "none")
    if not isinstance(named_raw, list) or not isinstance(rest_raw, dict):
        return unusable
    named: list[NamedAmount] = []
    for entry in named_raw:
        if not isinstance(entry, dict):
            return unusable
        name = entry.get("name")
        amount = entry.get("amount")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= MAX_SHARE_NAME:
            return unusable
        # type() and not isinstance(): True is an int in Python
        if type(amount) is not int or not 0 <= amount <= MAX_SHARE_AMOUNT:
            return unusable
        named.append(NamedAmount(name.strip(), amount))
    kind = rest_raw.get("kind", "none")
    names = rest_raw.get("names", [])
    if kind not in REST_KINDS or not isinstance(names, list) or unsupported not in UNSUPPORTED:
        return unusable
    if not all(isinstance(name, str) and name.strip() for name in names):
        return unusable
    return {
        "named_amounts": named,
        "rest": Rest(kind, [name.strip() for name in names]),
        "unsupported": unsupported,
    }


def _valid_date(value) -> str | None:
    try:
        return dt.date.fromisoformat(str(value)).isoformat()
    except ValueError:
        return None
