"""One member, addressed by its own id: rename and remove (US-02). docs/ARCHITECTURE.md §5."""

from fastapi import APIRouter
from psycopg import errors

from app.access import HouseholdAccess, member_not_found
from app.db import ConnDep, fetch_one
from app.errors import ApiError
from app.routers.households import MEMBER_COLUMNS, member_name_taken
from app.schemas import Id, Member, MemberIn

# The member's household key is required (app/access.py)
router = APIRouter(prefix="/api", tags=["members"], dependencies=[HouseholdAccess])


@router.patch("/members/{member_id}", response_model=Member)
def rename_member(member_id: Id, body: MemberIn, conn: ConnDep):
    sql = f"UPDATE members SET name = %s WHERE id = %s RETURNING {MEMBER_COLUMNS}"
    try:
        member = fetch_one(conn, sql, (body.name, member_id))
    except errors.UniqueViolation:
        raise member_name_taken() from None
    if member is None:
        raise member_not_found()
    return member


@router.delete("/members/{member_id}", status_code=204)
def remove_member(member_id: Id, conn: ConnDep):
    """A member who paid, shares or settled an expense stays: removing them changes balances."""
    try:
        deleted = conn.execute("DELETE FROM members WHERE id = %s", (member_id,)).rowcount
    except errors.ForeignKeyViolation:
        raise ApiError(
            409, "member_in_use", "This member is part of an expense or a settlement"
        ) from None
    if not deleted:
        raise member_not_found()
