"""Expenses and their split into shares (US-03, US-04, US-05). docs/ARCHITECTURE.md §5.

Any member records an expense, paid by anyone in the household; only the person who recorded it, or
the owner, changes or deletes it (docs/ACCOUNTS.md). A new expense is split between people with an
account in the household only; a name from before accounts that nobody has taken yet stays in the
expenses it is already part of.
"""

from datetime import date
from typing import Any

from fastapi import APIRouter
from psycopg import Connection, errors

from app.access import (
    AccessDep,
    HouseholdAccess,
    expense_not_found,
    recurring_not_found,
    require_owner_or_author,
)
from app.db import ConnDep, fetch_all, fetch_one
from app.errors import ApiError
from app.routers.households import lock_household
from app.schemas import Expense, ExpenseIn, Id
from app.services.splitting import equal_split, is_equal_split

# A session and an approved member are required, also for /expenses/{id} through its household
# (app/access.py)
router = APIRouter(prefix="/api", tags=["expenses"], dependencies=[HouseholdAccess])

# One row per expense, its shares gathered into a JSON list. Every expense has at least one share.
SELECT_EXPENSES = """
    SELECT e.id, e.household_id, e.description, e.amount, e.payer_id, e.spent_at, e.source,
           e.category, e.created_at, e.created_by, e.recurring_item_id,
           json_agg(json_build_object('member_id', s.member_id, 'amount', s.share_amount)
                    ORDER BY s.member_id) AS shares
    FROM expenses e
    JOIN expense_shares s ON s.expense_id = e.id
"""
NEWEST_FIRST = "GROUP BY e.id ORDER BY e.spent_at DESC, e.id DESC"


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


def member_without_account() -> ApiError:
    message = "Only people with an account in this household can be in a new expense"
    return ApiError(422, "member_without_account", message)


def compute_shares(
    conn: Connection, household_id: int, body: ExpenseIn, already_in: frozenset[int] = frozenset()
) -> dict[int, int]:
    """{member_id: share} for this expense, or a 422 saying what is wrong with the split.

    `already_in`: the names an edited expense had, which may stay even without an account."""
    split = body.split
    ids = split.member_ids if split.type == "equal" else [s.member_id for s in split.shares]
    if len(set(ids)) != len(ids):
        raise ApiError(422, "duplicate_member", "A member appears more than once in the split")

    members = {
        row[0]: row[1]
        for row in conn.execute(
            "SELECT m.id, hu.member_id IS NOT NULL FROM members m LEFT JOIN household_users hu"
            " ON hu.household_id = m.household_id AND hu.member_id = m.id"
            " WHERE m.household_id = %s",
            (household_id,),
        )
    }
    everyone = {body.payer_id, *ids}
    if not everyone <= members.keys():
        raise unknown_member()
    if any(not members[member_id] and member_id not in already_in for member_id in everyone):
        raise member_without_account()

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


# --- Recurring items (specs/007-recurring-expenses) ----------------------------------------------

MAX_RECURRING = 20


def month_taken(conn: Connection, item_id: int, spent_at: date, other_than: int | None) -> ApiError:
    """The 409 for a second expense of one item in one month, naming the one already there.

    Called after the unique index refused the write, inside a rolled-back savepoint, so the
    request's transaction can still read."""
    row = fetch_one(
        conn,
        "SELECT id FROM expenses WHERE recurring_item_id = %s AND id <> %s"
        " AND date_trunc('month', spent_at::timestamp) = date_trunc('month', %s::timestamp)",
        (item_id, other_than or 0, spent_at),
    )
    message = f"This recurring expense already has its expense for {spent_at:%m/%Y}"
    return ApiError(409, "recurring_month_taken", message,
                    details={"expense_id": row["id"] if row else None})


def new_recurring_item(conn: Connection, household_id: int, body: ExpenseIn, user_id: int) -> int:
    """The item a ticked new expense makes: equal split only, at most MAX_RECURRING active."""
    if body.split.type != "equal":
        raise ApiError(422, "recurring_needs_equal_split",
                       "A recurring expense is split equally between its people")
    # One creation at a time per house, so two people cannot both add the 20th item. NO KEY
    # UPDATE, not UPDATE: an ordinary expense's foreign key check takes FOR KEY SHARE on the house,
    # which this does not block, so other expenses are not held up meanwhile (review of #204)
    conn.execute("SELECT id FROM households WHERE id = %s FOR NO KEY UPDATE", (household_id,))
    active = conn.execute(
        "SELECT count(*) FROM recurring_items WHERE household_id = %s AND active", (household_id,)
    ).fetchone()[0]
    if active >= MAX_RECURRING:
        raise ApiError(409, "too_many_recurring",
                       f"A household has at most {MAX_RECURRING} recurring expenses")
    varying = body.recurring is not None and body.recurring.varying_amount
    return conn.execute(
        "INSERT INTO recurring_items (household_id, description, category, payer_id, member_ids,"
        " amount, day, created_by) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
        (household_id, body.description, body.category, body.payer_id,
         sorted(body.split.member_ids), None if varying else body.amount, body.spent_at.day,
         user_id),
    ).fetchone()[0]


def active_recurring_item(conn: Connection, household_id: int, item_id: int) -> int:
    """An item of this house that may still be recorded from. FOR SHARE against stop's FOR UPDATE:
    a save lands before a stop, or sees the item stopped."""
    row = fetch_one(
        conn,
        "SELECT active FROM recurring_items WHERE id = %s AND household_id = %s FOR SHARE",
        (item_id, household_id),
    )
    if row is None:
        raise recurring_not_found()
    if not row["active"]:
        raise ApiError(409, "recurring_stopped", "This recurring expense was stopped")
    return item_id


def save_shares(conn: Connection, expense_id: int, shares: dict[int, int]) -> None:
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO expense_shares (expense_id, member_id, share_amount) VALUES (%s, %s, %s)",
            [(expense_id, member_id, amount) for member_id, amount in shares.items()],
        )


@router.get("/households/{household_id}/expenses", response_model=list[Expense])
def list_expenses(household_id: Id, conn: ConnDep):
    """Newest first (by the day it was spent, then by when it was entered)."""
    rows = fetch_all(conn, f"{SELECT_EXPENSES} WHERE e.household_id = %s {NEWEST_FIRST}",
                     (household_id,))
    return [with_split_type(row) for row in rows]


@router.post("/households/{household_id}/expenses", response_model=Expense, status_code=201)
def create_expense(household_id: Id, body: ExpenseIn, access: AccessDep, conn: ConnDep):
    lock_household(conn, household_id, shared=True)  # never while a transfer is being told
    shares = compute_shares(conn, household_id, body)
    item_id = None
    if body.recurring is not None:
        item_id = new_recurring_item(conn, household_id, body, access.user_id)
    elif body.recurring_item_id is not None:
        item_id = active_recurring_item(conn, household_id, body.recurring_item_id)
    try:
        # A savepoint: after the unique index refuses, the 409 can still look up the month's expense
        with conn.transaction():
            expense_id = conn.execute(
                "INSERT INTO expenses (household_id, description, amount, payer_id, spent_at,"
                " source, category, created_by, recurring_item_id)"
                " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
                (household_id, body.description, body.amount, body.payer_id, body.spent_at,
                 body.source, body.category, access.user_id, item_id),
            ).fetchone()[0]
            save_shares(conn, expense_id, shares)
    except errors.ForeignKeyViolation:  # a member was removed while this request ran
        raise unknown_member() from None
    except errors.UniqueViolation:  # this item's month already has its expense
        raise month_taken(conn, item_id, body.spent_at, None) from None
    return get_expense(conn, expense_id)


@router.get("/expenses/{expense_id}", response_model=Expense)
def read_expense(expense_id: Id, conn: ConnDep):
    return get_expense(conn, expense_id)


@router.put("/expenses/{expense_id}", response_model=Expense)
def update_expense(expense_id: Id, body: ExpenseIn, access: AccessDep, conn: ConnDep):
    """Replaces the whole expense, shares included. Balances are computed, so they follow."""
    lock_household(conn, access.household_id, shared=True)
    row = fetch_one(
        conn,
        "SELECT household_id, payer_id, created_by, recurring_item_id FROM expenses"
        " WHERE id = %s FOR UPDATE",
        (expense_id,),
    )
    if row is None:
        raise expense_not_found()
    require_owner_or_author(access, row["created_by"])
    already_in = frozenset(
        {row["payer_id"]}
        | {
            share[0]
            for share in conn.execute(
                "SELECT member_id FROM expense_shares WHERE expense_id = %s", (expense_id,)
            )
        }
    )
    shares = compute_shares(conn, row["household_id"], body, already_in)
    # A page opened before categories sends none: keep the stored one rather than reset it to
    # "other" (review of #199). Sent explicitly, even "other", it replaces it.
    category = body.category if "category" in body.model_fields_set else None
    # The link to a recurring item never changes here (specs/007-recurring-expenses): a date moved
    # into a month that item already has is refused by the unique index
    try:
        with conn.transaction():
            conn.execute(
                "UPDATE expenses SET description = %s, amount = %s, payer_id = %s, spent_at = %s,"
                " source = %s, category = COALESCE(%s, category) WHERE id = %s",
                (body.description, body.amount, body.payer_id, body.spent_at, body.source,
                 category, expense_id),
            )
            conn.execute("DELETE FROM expense_shares WHERE expense_id = %s", (expense_id,))
            save_shares(conn, expense_id, shares)
    except errors.ForeignKeyViolation:
        raise unknown_member() from None
    except errors.UniqueViolation:
        raise month_taken(conn, row["recurring_item_id"], body.spent_at, expense_id) from None
    return get_expense(conn, expense_id)


@router.delete("/expenses/{expense_id}", status_code=204)
def delete_expense(expense_id: Id, access: AccessDep, conn: ConnDep):
    """Its shares go with it (ON DELETE CASCADE)."""
    lock_household(conn, access.household_id, shared=True)
    row = fetch_one(conn, "SELECT created_by FROM expenses WHERE id = %s FOR UPDATE", (expense_id,))
    if row is None:
        raise expense_not_found()
    require_owner_or_author(access, row["created_by"])
    conn.execute("DELETE FROM expenses WHERE id = %s", (expense_id,))
