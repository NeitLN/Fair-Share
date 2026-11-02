"""One name in a household's split, addressed by its own id: rename and remove (US-02).
docs/ARCHITECTURE.md §5. Both are the owner's (docs/ACCOUNTS.md)."""

from fastapi import APIRouter
from psycopg import errors

from app.access import AccessDep, HouseholdAccess, member_not_found, require_owner
from app.db import ConnDep
from app.errors import ApiError
from app.routers.households import get_member, member_name_taken
from app.schemas import Id, Member, MemberIn

# A session and an approved member of the name's household are required (app/access.py)
router = APIRouter(prefix="/api", tags=["members"], dependencies=[HouseholdAccess])


@router.patch("/members/{member_id}", response_model=Member)
def rename_member(member_id: Id, body: MemberIn, access: AccessDep, conn: ConnDep):
    require_owner(access)
    try:
        renamed = conn.execute(
            "UPDATE members SET name = %s WHERE id = %s", (body.name, member_id)
        ).rowcount
    except errors.UniqueViolation:
        raise member_name_taken() from None
    if not renamed:
        raise member_not_found()
    return get_member(conn, member_id)


@router.delete("/members/{member_id}", status_code=204)
def remove_member(member_id: Id, access: AccessDep, conn: ConnDep):
    """Only a name nobody's account uses, and that no expense or settlement uses either: removing
    one that is used would change balances."""
    require_owner(access)
    if get_member(conn, member_id)["role"] is not None:
        raise ApiError(
            409, "member_has_account", "This name belongs to someone in the household"
        )
    try:
        deleted = conn.execute("DELETE FROM members WHERE id = %s", (member_id,)).rowcount
    except errors.ForeignKeyViolation:
        raise ApiError(
            409, "member_in_use", "This member is part of an expense or a settlement"
        ) from None
    if not deleted:
        raise member_not_found()
