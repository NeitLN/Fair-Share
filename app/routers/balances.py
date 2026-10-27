"""Each member's balance and the transfers that settle everyone (US-06, US-07).

Computed on every request from the expenses and settlements, never stored, so an edit or a delete
shows up immediately. The maths is in app/services/balances.py.
"""

from fastapi import APIRouter

from app.access import HouseholdAccess
from app.db import ConnDep, fetch_all
from app.routers.households import require_household
from app.schemas import Balances, Id
from app.services.balances import net, suggest_settlements

# The household key is required (app/access.py)
router = APIRouter(prefix="/api", tags=["balances"], dependencies=[HouseholdAccess])

# sum() of bigint is numeric in PostgreSQL; cast back so Python gets an int, not a Decimal.
MEMBER_TOTALS = """
    SELECT m.id AS member_id, m.name,
           coalesce((SELECT sum(amount) FROM expenses WHERE payer_id = m.id), 0)::bigint AS paid,
           coalesce((SELECT sum(share_amount) FROM expense_shares WHERE member_id = m.id), 0)
               ::bigint AS owed,
           coalesce((SELECT sum(amount) FROM settlements WHERE from_member_id = m.id), 0)
               ::bigint AS sent,
           coalesce((SELECT sum(amount) FROM settlements WHERE to_member_id = m.id), 0)
               ::bigint AS received
    FROM members m
    WHERE m.household_id = %s
    ORDER BY m.id
"""


@router.get("/households/{household_id}/balances", response_model=Balances)
def get_balances(household_id: Id, conn: ConnDep):
    require_household(conn, household_id)
    balances = fetch_all(conn, MEMBER_TOTALS, (household_id,))
    for row in balances:
        row["net"] = net(row["paid"], row["owed"], row["sent"], row["received"])
    transfers = suggest_settlements({row["member_id"]: row["net"] for row in balances})
    return {
        "balances": balances,
        "suggested": [
            {"from_member_id": debtor, "to_member_id": creditor, "amount": amount}
            for debtor, creditor, amount in transfers
        ],
    }
