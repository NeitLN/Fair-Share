"""Who may read or change a household: whoever holds its key (#132).

There are no logins. Each household has a random secret key
(db/migrations/002_household_keys.sql), given once when it is created and passed around in the
invite link (`/households/12#k=…`). Every request about a household's data sends it in the
`X-Household-Key` header. A missing or wrong key gets exactly the answer a household that does not
exist would get (404), so ids cannot be probed.

The check is one router-level dependency (`HouseholdAccess`), so no route can forget it: it reads
the id in the path (a household, or a member, expense or settlement through the household it belongs
to) and compares the keys in constant time. Quick add uses its own connection and checks the key
itself (app/routers/ai.py).
"""

import hmac
from typing import Annotated

from fastapi import Depends, Header, Request
from psycopg import Connection
from pydantic import TypeAdapter, ValidationError

from app.db import ConnDep, fetch_one
from app.errors import ApiError
from app.schemas import Id

KEY_HEADER = "X-Household-Key"
HouseholdKey = Annotated[str | None, Header(alias=KEY_HEADER)]

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


# The key of the household that owns what a table row belongs to. Table names are fixed here, never
# taken from the request.
_THROUGH_HOUSEHOLD = (
    "SELECT h.access_key FROM {table} t JOIN households h ON h.id = t.household_id WHERE t.id = %s"
)

# Path parameter → how to find its household's key, and the 404 to give when it does not match.
_OWNERS = {
    "household_id": ("SELECT access_key FROM households WHERE id = %s", household_not_found),
    "member_id": (_THROUGH_HOUSEHOLD.format(table="members"), member_not_found),
    "expense_id": (_THROUGH_HOUSEHOLD.format(table="expenses"), expense_not_found),
    "settlement_id": (_THROUGH_HOUSEHOLD.format(table="settlements"), settlement_not_found),
}


def key_matches(stored: str | None, given: str | None) -> bool:
    """Constant time, so the answer's timing says nothing about how much of a guess was right."""
    if not stored or not given:
        return False
    return hmac.compare_digest(stored.encode(), given.encode())


def _path_id(raw: str) -> int | None:
    try:
        return _ID.validate_python(raw)
    except ValidationError:
        return None


def require_key(conn: Connection, param: str, item_id: int, key: str | None) -> None:
    sql, not_found = _OWNERS[param]
    row = fetch_one(conn, sql, (item_id,))
    if row is None or not key_matches(row["access_key"], key):
        raise not_found()


def check_household_key(request: Request, conn: ConnDep, key: HouseholdKey = None) -> None:
    """Router dependency: the request's household key must match the household in its path.

    Routes without such an id (creating a household) are not affected. It shares the request's one
    connection and transaction with the route (FastAPI caches ConnDep per request).
    """
    for param in _OWNERS:
        if param in request.path_params:
            item_id = _path_id(str(request.path_params[param]))
            if item_id is not None:
                require_key(conn, param, item_id, key)
            return


HouseholdAccess = Depends(check_household_key)
