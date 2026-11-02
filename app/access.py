"""Who may read or change a household: its signed-in members (docs/ACCOUNTS.md).

Every request needs a session (app/auth.py). A household's data is open to its owner and its
approved members; to anyone else, people still waiting for approval included, the household does
not exist (404), so ids cannot be probed. Inside a household some actions are the owner's only, or
belong to whoever recorded the thing (403); each route checks that with the helpers below.

The membership check is one router-level dependency (`HouseholdAccess`), so no route can forget
it: it reads the id in the path (a household, or a member, expense or settlement through the
household it belongs to). A route that needs the result asks for `AccessDep`, the same dependency,
which FastAPI runs only once per request. Quick add uses its own short connection and checks
membership itself (app/routers/ai.py).
"""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from psycopg import Connection
from pydantic import TypeAdapter, ValidationError

from app.auth import CurrentUser, forbidden
from app.db import ConnDep, fetch_one
from app.errors import ApiError
from app.schemas import Id

# Read a path id exactly as the routes do (their parameters are `Id`), so every id a route accepts
# is checked, "+7", " 7" and "7.0" included; whatever they refuse is left to their 422.
_ID = TypeAdapter(Id)


def household_not_found() -> ApiError:
    return ApiError(404, "household_not_found", "This household does not exist")


def member_not_found() -> ApiError:
    return ApiError(404, "member_not_found", "This member does not exist")


def expense_not_found() -> ApiError:
    return ApiError(404, "expense_not_found", "This expense does not exist")


def settlement_not_found() -> ApiError:
    return ApiError(404, "settlement_not_found", "This settlement does not exist")


@dataclass(frozen=True)
class Access:
    """The signed-in user's place in the household a request is about."""

    household_id: int
    user_id: int
    role: str  # "owner" or "member"; people waiting for approval never get this far
    member_id: int  # their name in the split

    @property
    def is_owner(self) -> bool:
        return self.role == "owner"


# The household that a table row belongs to, joined to the user's place in it. Table names are
# fixed here, never taken from the request.
_MEMBERSHIP = (
    " JOIN household_users hu ON hu.household_id = {household} AND hu.user_id = %s"
    " AND hu.role <> 'pending'"
)
_THROUGH_TABLE = (
    "SELECT t.household_id, hu.role, hu.member_id FROM {table} t"
    + _MEMBERSHIP.format(household="t.household_id")
    + " WHERE t.id = %s"
)

# Path parameter → how to find the household and the user's role, and the 404 when there is none.
_OWNERS = {
    "household_id": (
        "SELECT h.id AS household_id, hu.role, hu.member_id FROM households h"
        + _MEMBERSHIP.format(household="h.id")
        + " WHERE h.id = %s",
        household_not_found,
    ),
    "member_id": (_THROUGH_TABLE.format(table="members"), member_not_found),
    "expense_id": (_THROUGH_TABLE.format(table="expenses"), expense_not_found),
    "settlement_id": (_THROUGH_TABLE.format(table="settlements"), settlement_not_found),
}


def _path_id(raw: str) -> int | None:
    try:
        return _ID.validate_python(raw)
    except ValidationError:
        return None


def find_access(conn: Connection, param: str, item_id: int, user_id: int) -> Access:
    sql, not_found = _OWNERS[param]
    row = fetch_one(conn, sql, (user_id, item_id))
    if row is None:
        raise not_found()
    return Access(row["household_id"], user_id, row["role"], row["member_id"])


def household_access(request: Request, conn: ConnDep, user: CurrentUser) -> Access | None:
    """Router dependency: the user must be an approved member of the household in the path.

    Routes without such an id (listing or creating households) only need the session. It shares
    the request's one connection and transaction with the route (FastAPI caches ConnDep).
    """
    for param in _OWNERS:
        if param in request.path_params:
            item_id = _path_id(str(request.path_params[param]))
            if item_id is None:
                return None  # the route's own 422
            return find_access(conn, param, item_id, user["id"])
    return None


HouseholdAccess = Depends(household_access)
AccessDep = Annotated[Access, Depends(household_access)]


def require_owner(access: Access) -> None:
    if not access.is_owner:
        raise forbidden("Only the household's owner can do this")


def require_owner_or_author(access: Access, created_by: int | None) -> None:
    """The owner, or whoever recorded it. Things recorded before accounts belong to the owner."""
    if not access.is_owner and (created_by is None or created_by != access.user_id):
        raise forbidden("Only the person who recorded this, or the owner, can change it")
