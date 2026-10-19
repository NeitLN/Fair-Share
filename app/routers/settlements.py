"""Settlements: one member paying another back (US-08). docs/ARCHITECTURE.md §5.

There is no edit: a mistaken settlement is deleted and entered again.
"""

from fastapi import APIRouter
from psycopg import errors

from app.db import ConnDep, fetch_all, fetch_one
from app.errors import ApiError
from app.routers.households import require_household
from app.schemas import Id, Settlement, SettlementIn

router = APIRouter(prefix="/api", tags=["settlements"])

SETTLEMENT_COLUMNS = (
    "id, household_id, from_member_id, to_member_id, amount, settled_at, note, created_at"
)


def unknown_member() -> ApiError:
    message = "Both people in a settlement must be members of this household"
    return ApiError(422, "unknown_member", message)


@router.get("/households/{household_id}/settlements", response_model=list[Settlement])
def list_settlements(household_id: Id, conn: ConnDep):
    """Newest first (by the day it was paid, then by when it was entered)."""
    require_household(conn, household_id)
    sql = (
        f"SELECT {SETTLEMENT_COLUMNS} FROM settlements WHERE household_id = %s"
        " ORDER BY settled_at DESC, id DESC"
    )
    return fetch_all(conn, sql, (household_id,))


@router.post(
    "/households/{household_id}/settlements", response_model=Settlement, status_code=201
)
def create_settlement(household_id: Id, body: SettlementIn, conn: ConnDep):
    require_household(conn, household_id)
    if body.from_member_id == body.to_member_id:
        raise ApiError(422, "same_member", "A member cannot pay themselves")
    found = conn.execute(
        "SELECT count(*) FROM members WHERE household_id = %s AND id IN (%s, %s)",
        (household_id, body.from_member_id, body.to_member_id),
    ).fetchone()[0]
    if found != 2:
        raise unknown_member()
    try:
        return fetch_one(
            conn,
            "INSERT INTO settlements"
            " (household_id, from_member_id, to_member_id, amount, settled_at, note)"
            f" VALUES (%s, %s, %s, %s, %s, %s) RETURNING {SETTLEMENT_COLUMNS}",
            (household_id, body.from_member_id, body.to_member_id, body.amount,
             body.settled_at, body.note or None),
        )
    except errors.ForeignKeyViolation:  # a member was removed while this request ran
        raise unknown_member() from None


@router.delete("/settlements/{settlement_id}", status_code=204)
def delete_settlement(settlement_id: Id, conn: ConnDep):
    if not conn.execute("DELETE FROM settlements WHERE id = %s", (settlement_id,)).rowcount:
        raise ApiError(404, "settlement_not_found", "This settlement does not exist")
