"""Request and response bodies (Pydantic). Field names match frontend/src/api/types.ts exactly.

Limits mirror the CHECK constraints in db/migrations/001_init.sql, so a bad value is a 422 with the
field named, never a database error (docs/ARCHITECTURE.md §5, "Input limits"):

* Text is trimmed ("  Minh " is stored as "Minh"), put in one Unicode form (NFC) and may not contain
  control characters.
* Numbers in a body must be JSON numbers: `true`, `"1000"` and `1000.5` are refused, not converted.
* Dates must fall between 2000 and 2099.
"""

import unicodedata
from datetime import date, datetime
from typing import Annotated, Any, Literal

from fastapi import Path
from pydantic import BaseModel, BeforeValidator, Field, StrictInt, StringConstraints

BIGINT_MAX = 2**63 - 1

# A bigint primary key in a URL. Larger numbers cannot exist, so they are a 422, not a 500.
Id = Annotated[int, Path(ge=1, le=BIGINT_MAX)]

# A member id inside a body: a real JSON number (`true` would otherwise become member 1).
MemberId = Annotated[StrictInt, Field(ge=1, le=BIGINT_MAX)]

# The day an expense was spent or a settlement paid. Anything outside this range is a typo
# (year 0001 or 9999) that would sort the lists and the balances history in odd places.
Day = Annotated[date, Field(ge=date(2000, 1, 1), le=date(2099, 12, 31))]


def clean_text(value: Any) -> Any:
    """Runs before the length limits on every text field.

    * NFC: Vietnamese letters can arrive as one character ("ế") or as a letter plus combining
      marks (some keyboards, copy-paste). Both look identical; storing one form keeps "Tiến" and
      "Tiến" from becoming two members and lets the length limits count what the user sees.
    * Control characters (NUL, bell, line breaks inside a name, ...) and broken UTF-8 (a lone
      surrogate) are refused: PostgreSQL cannot store NUL or invalid UTF-8, which used to be a 500.
    """
    if not isinstance(value, str):
        return value  # not text: the str type check reports it
    value = value.strip()
    if any(unicodedata.category(ch) in ("Cc", "Cs") for ch in value):
        raise ValueError("must not contain control characters")
    return unicodedata.normalize("NFC", value)


def text(max_length: int, min_length: int = 1):
    """A text field of `min_length`-`max_length` characters, cleaned by clean_text()."""
    return Annotated[
        str,
        BeforeValidator(clean_text),
        StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length),
    ]


HouseholdName = text(60)
MemberName = text(40)


class HouseholdIn(BaseModel):
    name: HouseholdName


class Household(BaseModel):
    id: int
    name: str
    created_at: datetime


class MemberIn(BaseModel):
    name: MemberName


class Member(BaseModel):
    id: int
    household_id: int
    name: str
    created_at: datetime


# --- Expenses (US-03, US-04, US-05) -----------------------------------------------------------

# Whole đồng. 1 000 billion is far beyond any household expense and keeps every sum within bigint.
MAX_AMOUNT = 1_000_000_000_000
# One expense is shared by at most this many people (a household is 2-6 in practice).
MAX_PARTICIPANTS = 50

Amount = Annotated[StrictInt, Field(gt=0, le=MAX_AMOUNT)]
Description = text(120)


class EqualSplit(BaseModel):
    """Everyone listed pays the same; leftover đồng go to the lowest member ids."""

    type: Literal["equal"]
    member_ids: list[MemberId] = Field(min_length=1, max_length=MAX_PARTICIPANTS)


class Share(BaseModel):
    member_id: MemberId
    amount: Annotated[StrictInt, Field(ge=0, le=MAX_AMOUNT)]


class CustomSplit(BaseModel):
    """Each share given explicitly; they must add up to the expense amount."""

    type: Literal["custom"]
    shares: list[Share] = Field(min_length=1, max_length=MAX_PARTICIPANTS)


class ExpenseIn(BaseModel):
    """Body of POST /api/households/{id}/expenses and PUT /api/expenses/{id}."""

    description: Description
    amount: Amount
    payer_id: MemberId
    spent_at: Day
    # "ai" when the form was pre-filled by Quick add and then saved by the user.
    source: Literal["manual", "ai"] = "manual"
    split: Annotated[EqualSplit | CustomSplit, Field(discriminator="type")]


class Expense(BaseModel):
    id: int
    household_id: int
    description: str
    amount: int
    payer_id: int
    spent_at: date
    source: Literal["manual", "ai"]
    created_at: datetime
    # How to show the split in the edit form: "equal" when the shares are exactly the equal split.
    split_type: Literal["equal", "custom"]
    # One per participant, in member id order; they always add up to `amount`.
    shares: list[Share]


# --- Settlements (US-08) ------------------------------------------------------------------------


class SettlementIn(BaseModel):
    """Body of POST /api/households/{id}/settlements: "from paid to `amount` đồng"."""

    from_member_id: MemberId
    to_member_id: MemberId
    amount: Amount
    settled_at: Day
    # Optional; blank is stored as no note.
    note: text(200, min_length=0) | None = None


class Settlement(BaseModel):
    id: int
    household_id: int
    from_member_id: int
    to_member_id: int
    amount: int
    settled_at: date
    note: str | None
    created_at: datetime


# --- Balances (US-06, US-07) --------------------------------------------------------------------


class MemberBalance(BaseModel):
    member_id: int
    name: str
    paid: int  # total of the expenses this member paid for
    owed: int  # total of this member's shares
    sent: int  # settlements this member paid to others
    received: int  # settlements others paid to this member
    # paid - owed + sent - received. Positive: the household owes them; negative: they owe.
    net: int


class Transfer(BaseModel):
    from_member_id: int
    to_member_id: int
    amount: int


class Balances(BaseModel):
    # Every member, in member id order; the nets add up to exactly 0.
    balances: list[MemberBalance]
    # Paying these settles everyone (at most one fewer than the members with a balance).
    suggested: list[Transfer]


# --- AI Quick add (US-09, US-10) ----------------------------------------------------------------

# Same limit as app/services/gemini.py: longer text is refused before Gemini is called.
AiText = text(300)


class AiParseIn(BaseModel):
    """Body of POST /api/households/{id}/ai/parse-expense."""

    text: AiText


class DraftSplit(BaseModel):
    type: Literal["equal"]
    member_ids: list[int]


class ExpenseDraft(BaseModel):
    """A pre-filled expense form. Nothing is saved: after checking it, the user sends it (fixed if
    needed) to POST /api/households/{id}/expenses, which validates it like any other expense."""

    description: str
    amount: int | None  # None when the sentence had no usable amount: the user types it
    payer_id: int | None  # None when the payer was missing or is not a member
    spent_at: date
    source: Literal["ai"]
    split: DraftSplit


class DraftWarning(BaseModel):
    # unknown_member · no_payer · no_amount · participants_assumed
    code: str
    message: str
    name: str | None = None  # the name as written, for unknown_member


class AiDraft(BaseModel):
    draft: ExpenseDraft
    # What the user should look at before saving; empty when Gemini understood everything.
    warnings: list[DraftWarning]
