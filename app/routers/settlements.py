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
from app.schemas import Id, Notice, NoticeIn, Settlement, SettlementIn

# A session and an approved member are required, also for /settlements/{id} through its household
# (app/access.py)
router = APIRouter(prefix="/api", tags=["settlements"], dependencies=[HouseholdAccess])

SETTLEMENT_COLUMNS = (
    "id, household_id, from_member_id, to_member_id, amount, settled_at, note, created_at,"
    " created_by"
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
        settlement = fetch_one(
            conn,
            "INSERT INTO settlements"
            " (household_id, from_member_id, to_member_id, amount, settled_at, note, created_by)"
            f" VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING {SETTLEMENT_COLUMNS}",
            (household_id, body.from_member_id, body.to_member_id, body.amount,
             body.settled_at, body.note or None, access.user_id),
        )
    except errors.ForeignKeyViolation:  # a member was removed while this request ran
        raise unknown_member() from None
    # The money arrived: a "Tôi đã chuyển" about it has been answered
    conn.execute(
        "DELETE FROM payment_notices"
        " WHERE household_id = %s AND from_member_id = %s AND to_member_id = %s",
        (household_id, body.from_member_id, body.to_member_id),
    )
    return settlement


# --- "Tôi đã chuyển" (docs/ACCOUNTS.md, S3) -----------------------------------------------------

NOTICE_COLUMNS = "from_member_id, to_member_id, amount, status, created_at"


def notice_not_found() -> ApiError:
    return ApiError(404, "notice_not_found", "There is no such notice")


@router.get("/households/{household_id}/notices", response_model=list[Notice])
def list_notices(household_id: Id, conn: ConnDep):
    """Everyone in the household sees them: the payer, the receiver and the others' "chưa trả"."""
    sql = (
        f"SELECT {NOTICE_COLUMNS} FROM payment_notices WHERE household_id = %s"
        " ORDER BY created_at, from_member_id, to_member_id"
    )
    return fetch_all(conn, sql, (household_id,))


@router.put("/households/{household_id}/notices", response_model=Notice)
def send_notice(household_id: Id, body: NoticeIn, access: AccessDep, conn: ConnDep):
    """The signed-in member tells `to` they sent the money. It changes no balance: `to` records the
    repayment (S2). Telling again, after a "Chưa nhận được" too, replaces the notice."""
    if body.to_member_id == access.member_id:
        raise ApiError(422, "same_member", "A member cannot pay themselves")
    try:
        return fetch_one(
            conn,
            "INSERT INTO payment_notices"
            " (household_id, from_member_id, to_member_id, amount, created_by)"
            " VALUES (%s, %s, %s, %s, %s)"
            " ON CONFLICT (household_id, from_member_id, to_member_id) DO UPDATE"
            " SET amount = excluded.amount, status = 'sent', created_by = excluded.created_by,"
            " created_at = now()"
            f" RETURNING {NOTICE_COLUMNS}",
            (household_id, access.member_id, body.to_member_id, body.amount, access.user_id),
        )
    except errors.ForeignKeyViolation:  # not a name in this household, or removed meanwhile
        raise unknown_member() from None


@router.delete("/households/{household_id}/notices/{to_member}", status_code=204)
def cancel_notice(household_id: Id, to_member: Id, access: AccessDep, conn: ConnDep):
    """The payer takes their own notice back (pressed by mistake). Nobody else can."""
    conn.execute(
        "DELETE FROM payment_notices"
        " WHERE household_id = %s AND from_member_id = %s AND to_member_id = %s",
        (household_id, access.member_id, to_member),
    )


@router.post(
    "/households/{household_id}/notices/{from_member}/decline", response_model=Notice
)
def decline_notice(household_id: Id, from_member: Id, access: AccessDep, conn: ConnDep):
    """The receiver's "Chưa nhận được". The payer's card shows it until they tell again or the
    repayment is recorded."""
    row = fetch_one(
        conn,
        "UPDATE payment_notices SET status = 'declined'"
        " WHERE household_id = %s AND from_member_id = %s AND to_member_id = %s"
        f" AND status = 'sent' RETURNING {NOTICE_COLUMNS}",
        (household_id, from_member, access.member_id),
    )
    if row is None:
        raise notice_not_found()
    return row


@router.delete("/settlements/{settlement_id}", status_code=204)
def delete_settlement(settlement_id: Id, access: AccessDep, conn: ConnDep):
    row = fetch_one(
        conn, "SELECT created_by FROM settlements WHERE id = %s FOR UPDATE", (settlement_id,)
    )
    if row is None:
        raise settlement_not_found()
    require_owner_or_author(access, row["created_by"])
    conn.execute("DELETE FROM settlements WHERE id = %s", (settlement_id,))
