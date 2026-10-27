"""Households and the members inside them (US-01, US-02). docs/ARCHITECTURE.md §5."""

from fastapi import APIRouter
from psycopg import Connection, errors

from app.access import HouseholdAccess, household_not_found
from app.db import ConnDep, fetch_all, fetch_one
from app.errors import ApiError
from app.schemas import Household, HouseholdCreated, HouseholdIn, Id, Member, MemberIn

# Every route here with a household id in its path needs that household's key (app/access.py)
router = APIRouter(prefix="/api", tags=["households"], dependencies=[HouseholdAccess])

HOUSEHOLD_COLUMNS = "id, name, created_at"
MEMBER_COLUMNS = "id, household_id, name, created_at"


def member_name_taken() -> ApiError:
    return ApiError(409, "member_name_taken", "This household already has a member with that name")


def require_household(conn: Connection, household_id: int) -> None:
    if fetch_one(conn, "SELECT 1 FROM households WHERE id = %s", (household_id,)) is None:
        raise household_not_found()


# There is deliberately no GET /households (#132): without logins, a list of every household would
# show every group's households to anyone who opens the site. Each browser remembers the households
# it created or opened (frontend/src/lib/knownHouseholds.ts) and loads them one by one.


@router.post("/households", response_model=HouseholdCreated, status_code=201)
def create_household(body: HouseholdIn, conn: ConnDep):
    """The answer carries the household's key, the only time the API ever sends it."""
    returning = f"{HOUSEHOLD_COLUMNS}, access_key AS key"
    sql = f"INSERT INTO households (name) VALUES (%s) RETURNING {returning}"
    return fetch_one(conn, sql, (body.name,))


@router.get("/households/{household_id}", response_model=Household)
def get_household(household_id: Id, conn: ConnDep):
    sql = f"SELECT {HOUSEHOLD_COLUMNS} FROM households WHERE id = %s"
    household = fetch_one(conn, sql, (household_id,))
    if household is None:
        raise household_not_found()
    return household


@router.patch("/households/{household_id}", response_model=Household)
def rename_household(household_id: Id, body: HouseholdIn, conn: ConnDep):
    sql = f"UPDATE households SET name = %s WHERE id = %s RETURNING {HOUSEHOLD_COLUMNS}"
    household = fetch_one(conn, sql, (body.name, household_id))
    if household is None:
        raise household_not_found()
    return household


@router.delete("/households/{household_id}", status_code=204)
def delete_household(household_id: Id, conn: ConnDep):
    """Removes the household and everything in it, in one transaction.

    Expenses (and with them their shares) go first: a single DELETE of the household would fail,
    see the comment at the top of db/migrations/001_init.sql.
    """
    conn.execute("DELETE FROM expenses WHERE household_id = %s", (household_id,))
    deleted = conn.execute("DELETE FROM households WHERE id = %s", (household_id,)).rowcount
    if not deleted:
        raise household_not_found()


@router.get("/households/{household_id}/members", response_model=list[Member])
def list_members(household_id: Id, conn: ConnDep):
    """Oldest first: the equal split gives remainder đồng to the lowest member ids."""
    require_household(conn, household_id)
    sql = f"SELECT {MEMBER_COLUMNS} FROM members WHERE household_id = %s ORDER BY id"
    return fetch_all(conn, sql, (household_id,))


@router.post("/households/{household_id}/members", response_model=Member, status_code=201)
def add_member(household_id: Id, body: MemberIn, conn: ConnDep):
    require_household(conn, household_id)
    sql = f"INSERT INTO members (household_id, name) VALUES (%s, %s) RETURNING {MEMBER_COLUMNS}"
    try:
        return fetch_one(conn, sql, (household_id, body.name))
    except errors.UniqueViolation:
        raise member_name_taken() from None
