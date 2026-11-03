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
from app.routers.balances import compute
from app.schemas import Id, Notice, NoticeAccept, NoticeAnswer, NoticeIn, Settlement, SettlementIn

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
    # The told amount, recorded by hand ("Ghi khoản trả khác"): that notice has been answered. Any
    # other repayment between the two leaves it for the receiver to answer
    conn.execute(
        "DELETE FROM payment_notices WHERE household_id = %s AND from_member_id = %s"
        " AND to_member_id = %s AND status = 'sent' AND amount = %s",
        (household_id, body.from_member_id, body.to_member_id, body.amount),
    )
    return settlement


# --- "Tôi đã chuyển" (docs/ACCOUNTS.md, S3) -----------------------------------------------------

NOTICE_COLUMNS = "from_member_id, to_member_id, amount, status, created_at"


def notice_changed() -> ApiError:
    message = "This notice was taken back, answered or told again with another amount"
    return ApiError(409, "notice_changed", message)


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
    repayment (S2). Telling again, after a "Chưa nhận được" too, replaces the notice.

    Only a transfer suggested right now can be told, for its exact amount: the one who owes tells
    the one they owe. Balances that changed since the page loaded give suggestion_changed, and the
    page shows the new suggestion before anyone tells again."""
    if body.to_member_id == access.member_id:
        raise ApiError(422, "same_member", "A member cannot pay themselves")
    balances, transfers = compute(conn, household_id)
    if body.to_member_id not in {row["member_id"] for row in balances}:
        raise unknown_member()
    if (access.member_id, body.to_member_id, body.amount) not in transfers:
        message = "This transfer is not suggested any more; reload the balances"
        raise ApiError(409, "suggestion_changed", message)
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
    except errors.ForeignKeyViolation:  # removed while this request ran
        raise unknown_member() from None


@router.delete("/households/{household_id}/notices/{to_member}", status_code=204)
def cancel_notice(household_id: Id, to_member: Id, access: AccessDep, conn: ConnDep):
    """The payer takes their own notice back (pressed by mistake, or after "Chưa nhận được").
    Nobody else can."""
    conn.execute(
        "DELETE FROM payment_notices"
        " WHERE household_id = %s AND from_member_id = %s AND to_member_id = %s",
        (household_id, access.member_id, to_member),
    )


@router.post(
    "/households/{household_id}/notices/{from_member}/accept",
    response_model=Settlement,
    status_code=201,
)
def accept_notice(
    household_id: Id, from_member: Id, body: NoticeAccept, access: AccessDep, conn: ConnDep
):
    """The receiver's "Đã nhận" on a notice: records the told amount and answers the notice, in one
    transaction. The notice row is taken first, so a second "Đã nhận" (another tab, a retry after
    a lost answer) finds nothing and records nothing; so does one for an amount told differently
    since."""
    taken = fetch_one(
        conn,
        "DELETE FROM payment_notices"
        " WHERE household_id = %s AND from_member_id = %s AND to_member_id = %s"
        " AND status = 'sent' AND amount = %s RETURNING amount",
        (household_id, from_member, access.member_id, body.amount),
    )
    if taken is None:
        raise notice_changed()
    try:
        return fetch_one(
            conn,
            "INSERT INTO settlements"
            " (household_id, from_member_id, to_member_id, amount, settled_at, created_by)"
            f" VALUES (%s, %s, %s, %s, %s, %s) RETURNING {SETTLEMENT_COLUMNS}",
            (household_id, from_member, access.member_id, taken["amount"], body.settled_at,
             access.user_id),
        )
    except errors.ForeignKeyViolation:  # a member was removed while this request ran
        raise unknown_member() from None


@router.post(
    "/households/{household_id}/notices/{from_member}/decline", response_model=Notice
)
def decline_notice(
    household_id: Id, from_member: Id, body: NoticeAnswer, access: AccessDep, conn: ConnDep
):
    """The receiver's "Chưa nhận được" on the amount they were shown. The payer's card shows it
    until they tell again, take it back, or the repayment is recorded."""
    row = fetch_one(
        conn,
        "UPDATE payment_notices SET status = 'declined'"
        " WHERE household_id = %s AND from_member_id = %s AND to_member_id = %s"
        f" AND status = 'sent' AND amount = %s RETURNING {NOTICE_COLUMNS}",
        (household_id, from_member, access.member_id, body.amount),
    )
    if row is None:
        raise notice_changed()
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
