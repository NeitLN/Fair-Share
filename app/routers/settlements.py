"""Settlements: one member paying another back (US-08). docs/ARCHITECTURE.md §5.

A repayment is recorded by the person who received it: "Đã nhận" confirms money that reached
them, so nobody can mark someone else's debt as paid (docs/ACCOUNTS.md). The owner can delete a
mistaken one; there is no edit: it is deleted and entered again.
"""

from fastapi import APIRouter
from psycopg import errors

from app.access import AccessDep, HouseholdAccess, require_owner_or_author, settlement_not_found
from app.auth import forbidden
from app.db import ConnDep, fetch_all, fetch_one
from app.errors import ApiError
from app.schemas import Id, Settlement, SettlementIn

# A session and an approved member are required, also for /settlements/{id} through its household
# (app/access.py)
router = APIRouter(prefix="/api", tags=["settlements"], dependencies=[HouseholdAccess])

SETTLEMENT_COLUMNS = (
    "id, household_id, from_member_id, to_member_id, amount, settled_at, note, created_at"
)


def unknown_member() -> ApiError:
    message = "Both people in a settlement must be members of this household"
    return ApiError(422, "unknown_member", message)


@router.get("/households/{household_id}/settlements", response_model=list[Settlement])
def list_settlements(household_id: Id, conn: ConnDep):
    """Newest first (by the day it was paid, then by when it was entered)."""
    sql = (
        f"SELECT {SETTLEMENT_COLUMNS} FROM settlements WHERE household_id = %s"
        " ORDER BY settled_at DESC, id DESC"
    )
    return fetch_all(conn, sql, (household_id,))


@router.post(
    "/households/{household_id}/settlements", response_model=Settlement, status_code=201
)
def create_settlement(household_id: Id, body: SettlementIn, access: AccessDep, conn: ConnDep):
    if body.from_member_id == body.to_member_id:
        raise ApiError(422, "same_member", "A member cannot pay themselves")
    found = conn.execute(
        "SELECT count(*) FROM members WHERE household_id = %s AND id IN (%s, %s)",
        (household_id, body.from_member_id, body.to_member_id),
    ).fetchone()[0]
    if found != 2:
        raise unknown_member()
    if body.to_member_id != access.member_id:
        raise forbidden("Only the person who received the money can record it")
    try:
        return fetch_one(
            conn,
            "INSERT INTO settlements"
            " (household_id, from_member_id, to_member_id, amount, settled_at, note, created_by)"
            f" VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING {SETTLEMENT_COLUMNS}",
            (household_id, body.from_member_id, body.to_member_id, body.amount,
             body.settled_at, body.note or None, access.user_id),
        )
    except errors.ForeignKeyViolation:  # a member was removed while this request ran
        raise unknown_member() from None


@router.delete("/settlements/{settlement_id}", status_code=204)
def delete_settlement(settlement_id: Id, access: AccessDep, conn: ConnDep):
    row = fetch_one(
        conn, "SELECT created_by FROM settlements WHERE id = %s FOR UPDATE", (settlement_id,)
    )
    if row is None:
        raise settlement_not_found()
    require_owner_or_author(access, row["created_by"])
    conn.execute("DELETE FROM settlements WHERE id = %s", (settlement_id,))
