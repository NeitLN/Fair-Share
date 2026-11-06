"""Recurring expenses (specs/007-recurring-expenses): the house's active items, and stopping one.

An item is made from a new expense and recorded from through the expense routes
(app/routers/expenses.py), where one expense per item and month is held by the database. Here only
what the page lists and the "Ngừng lặp" its creator or the owner can press. An item is never
deleted, so the expenses recorded from it keep their link.
"""

from fastapi import APIRouter

from app.access import AccessDep, HouseholdAccess, recurring_not_found, require_owner_or_author
from app.db import ConnDep, fetch_all, fetch_one
from app.schemas import Id, RecurringItem

# A session and an approved member are required, also for /recurring/{id} through its household
router = APIRouter(prefix="/api", tags=["recurring"], dependencies=[HouseholdAccess])


@router.get("/households/{household_id}/recurring", response_model=list[RecurringItem])
def list_recurring(household_id: Id, conn: ConnDep):
    """The active items, oldest first."""
    return fetch_all(
        conn,
        "SELECT id, household_id, description, category, payer_id, member_ids, amount, day,"
        " created_by, created_at FROM recurring_items"
        " WHERE household_id = %s AND active ORDER BY created_at, id",
        (household_id,),
    )


@router.post("/recurring/{recurring_id}/stop", status_code=204)
def stop_recurring(recurring_id: Id, access: AccessDep, conn: ConnDep):
    """Never suggested again; its expenses stay. FOR UPDATE against a save's FOR SHARE."""
    row = fetch_one(
        conn,
        "SELECT created_by, active FROM recurring_items WHERE id = %s FOR UPDATE",
        (recurring_id,),
    )
    if row is None:
        raise recurring_not_found()
    require_owner_or_author(access, row["created_by"])
    if row["active"]:
        conn.execute(
            "UPDATE recurring_items SET active = false, stopped_at = now() WHERE id = %s",
            (recurring_id,),
        )
