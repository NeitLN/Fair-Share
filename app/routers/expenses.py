"""Expenses and their split into shares (US-03, US-04, US-05). docs/ARCHITECTURE.md §5."""

from typing import Any

from fastapi import APIRouter
from psycopg import Connection, errors

from app.db import ConnDep, fetch_all, fetch_one
from app.errors import ApiError
from app.routers.households import require_household
from app.schemas import Expense, ExpenseIn, Id
from app.services.splitting import equal_split, is_equal_split

router = APIRouter(prefix="/api", tags=["expenses"])

# One row per expense, its shares gathered into a JSON list. Every expense has at least one share.
SELECT_EXPENSES = """
    SELECT e.id, e.household_id, e.description, e.amount, e.payer_id, e.spent_at, e.source,
           e.created_at,
           json_agg(json_build_object('member_id', s.member_id, 'amount', s.share_amount)
                    ORDER BY s.member_id) AS shares
    FROM expenses e
    JOIN expense_shares s ON s.expense_id = e.id
"""
NEWEST_FIRST = "GROUP BY e.id ORDER BY e.spent_at DESC, e.id DESC"


def expense_not_found() -> ApiError:
    return ApiError(404, "expense_not_found", "This expense does not exist")


def unknown_member() -> ApiError:
    message = "The payer and everyone in the split must be members of this household"
    return ApiError(422, "unknown_member", message)


def with_split_type(row: dict[str, Any]) -> dict[str, Any]:
    shares = {share["member_id"]: share["amount"] for share in row["shares"]}
    row["split_type"] = "equal" if is_equal_split(row["amount"], shares) else "custom"
    return row


def get_expense(conn: Connection, expense_id: int) -> dict[str, Any]:
    row = fetch_one(conn, f"{SELECT_EXPENSES} WHERE e.id = %s {NEWEST_FIRST}", (expense_id,))
    if row is None:
        raise expense_not_found()
    return with_split_type(row)


def compute_shares(conn: Connection, household_id: int, body: ExpenseIn) -> dict[int, int]:
    """{member_id: share} for this expense, or a 422 saying what is wrong with the split."""
    split = body.split
    ids = split.member_ids if split.type == "equal" else [s.member_id for s in split.shares]
    if len(set(ids)) != len(ids):
        raise ApiError(422, "duplicate_member", "A member appears more than once in the split")

    members = {
        row[0]
        for row in conn.execute("SELECT id FROM members WHERE household_id = %s", (household_id,))
    }
    if body.payer_id not in members or not set(ids) <= members:
        raise unknown_member()

    if split.type == "equal":
        return equal_split(body.amount, ids)
    shares = {s.member_id: s.amount for s in split.shares}
    total = sum(shares.values())
    if total != body.amount:
        raise ApiError(
            422,
            "split_mismatch",
            f"The shares add up to {total} đồng, but the expense is {body.amount} đồng",
        )
    return shares


def save_shares(conn: Connection, expense_id: int, shares: dict[int, int]) -> None:
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO expense_shares (expense_id, member_id, share_amount) VALUES (%s, %s, %s)",
            [(expense_id, member_id, amount) for member_id, amount in shares.items()],
        )


@router.get("/households/{household_id}/expenses", response_model=list[Expense])
def list_expenses(household_id: Id, conn: ConnDep):
    """Newest first (by the day it was spent, then by when it was entered)."""
    require_household(conn, household_id)
    rows = fetch_all(conn, f"{SELECT_EXPENSES} WHERE e.household_id = %s {NEWEST_FIRST}",
                     (household_id,))
    return [with_split_type(row) for row in rows]


@router.post("/households/{household_id}/expenses", response_model=Expense, status_code=201)
def create_expense(household_id: Id, body: ExpenseIn, conn: ConnDep):
    require_household(conn, household_id)
    shares = compute_shares(conn, household_id, body)
    try:
        expense_id = conn.execute(
            "INSERT INTO expenses (household_id, description, amount, payer_id, spent_at, source)"
            " VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
            (household_id, body.description, body.amount, body.payer_id, body.spent_at,
             body.source),
        ).fetchone()[0]
        save_shares(conn, expense_id, shares)
    except errors.ForeignKeyViolation:  # a member was removed while this request ran
        raise unknown_member() from None
    return get_expense(conn, expense_id)


@router.get("/expenses/{expense_id}", response_model=Expense)
def read_expense(expense_id: Id, conn: ConnDep):
    return get_expense(conn, expense_id)


@router.put("/expenses/{expense_id}", response_model=Expense)
def update_expense(expense_id: Id, body: ExpenseIn, conn: ConnDep):
    """Replaces the whole expense, shares included. Balances are computed, so they follow."""
    row = fetch_one(conn, "SELECT household_id FROM expenses WHERE id = %s FOR UPDATE",
                    (expense_id,))
    if row is None:
        raise expense_not_found()
    shares = compute_shares(conn, row["household_id"], body)
    try:
        conn.execute(
            "UPDATE expenses SET description = %s, amount = %s, payer_id = %s, spent_at = %s,"
            " source = %s WHERE id = %s",
            (body.description, body.amount, body.payer_id, body.spent_at, body.source,
             expense_id),
        )
        conn.execute("DELETE FROM expense_shares WHERE expense_id = %s", (expense_id,))
        save_shares(conn, expense_id, shares)
    except errors.ForeignKeyViolation:
        raise unknown_member() from None
    return get_expense(conn, expense_id)


@router.delete("/expenses/{expense_id}", status_code=204)
def delete_expense(expense_id: Id, conn: ConnDep):
    """Its shares go with it (ON DELETE CASCADE)."""
    if not conn.execute("DELETE FROM expenses WHERE id = %s", (expense_id,)).rowcount:
        raise expense_not_found()
