"""Request and response bodies (Pydantic). Field names match frontend/src/api/types.ts exactly.

Limits mirror the CHECK constraints in db/migrations/001_init.sql, so a bad value is a 422 with the
field named, never a database error. Names are trimmed first: "  Minh " is stored as "Minh".
"""

from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import Path
from pydantic import BaseModel, Field, StringConstraints

# A bigint primary key in a URL. Larger numbers cannot exist, so they are a 422, not a 500.
Id = Annotated[int, Path(ge=1, le=2**63 - 1)]

HouseholdName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)
]
MemberName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)
]


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

Amount = Annotated[int, Field(gt=0, le=MAX_AMOUNT)]
Description = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]


class EqualSplit(BaseModel):
    """Everyone listed pays the same; leftover đồng go to the lowest member ids."""

    type: Literal["equal"]
    member_ids: list[int] = Field(min_length=1, max_length=MAX_PARTICIPANTS)


class Share(BaseModel):
    member_id: int
    amount: Annotated[int, Field(ge=0, le=MAX_AMOUNT)]


class CustomSplit(BaseModel):
    """Each share given explicitly; they must add up to the expense amount."""

    type: Literal["custom"]
    shares: list[Share] = Field(min_length=1, max_length=MAX_PARTICIPANTS)


class ExpenseIn(BaseModel):
    """Body of POST /api/households/{id}/expenses and PUT /api/expenses/{id}."""

    description: Description
    amount: Amount
    payer_id: int
    spent_at: date
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
