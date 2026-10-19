"""Request and response bodies (Pydantic). Field names match frontend/src/api/types.ts exactly.

Limits mirror the CHECK constraints in db/migrations/001_init.sql, so a bad value is a 422 with the
field named, never a database error. Names are trimmed first: "  Minh " is stored as "Minh".
"""

from datetime import datetime
from typing import Annotated

from fastapi import Path
from pydantic import BaseModel, StringConstraints

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
