"""No double save (specs/020-no-double-save): one record per draft, however often it is pressed.

The page gives each draft (an expense form, a repayment form, a suggested-transfer card) an
identity and sends it with every press. A create route that gets one does, in this order:

1. lock the house, as it always does (the house lock stays first, research R1);
2. `lock_draft()`: requests of the same house, account and identity take turns from here, so a
   repeat that arrives while the first is still running waits for it and then finds its record;
3. `find_draft()`, before any other check: a record with the same fingerprint comes back as it is
   now (200, nothing changes); one with another fingerprint is `already_saved()` (409).

Otherwise the request is a first save, runs every check, and stores the identity and its
fingerprint with the record (db/migrations/013_draft_ids.sql).
"""

import hashlib
import json
from typing import Literal
from uuid import UUID

from psycopg import Connection

from app.db import fetch_one
from app.errors import ApiError
from app.schemas import ExpenseIn, SettlementIn

Kind = Literal["expense", "settlement"]
TABLES: dict[Kind, str] = {"expense": "expenses", "settlement": "settlements"}


def _digest(fields: dict) -> str:
    canonical = json.dumps(fields, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def expense_fingerprint(body: ExpenseIn) -> str:
    """What the request said, normalized (FR-006): the same for a pure retry, different for any
    change a person would call another expense. `source` (typed or quick add) is left out."""
    split = body.split
    if split.type == "equal":
        shares = {"type": "equal", "members": sorted(split.member_ids)}
    else:
        shares = {"type": "custom",
                  "shares": {str(s.member_id): s.amount for s in split.shares}}
    if body.recurring is not None:
        recurring = {"tick": body.recurring.varying_amount}
    elif body.recurring_item_id is not None:
        recurring = {"item": body.recurring_item_id}
    else:
        recurring = None
    return _digest({
        "description": body.description.strip(), "amount": body.amount, "payer": body.payer_id,
        "spent_at": body.spent_at.isoformat(), "category": body.category or "other",
        "split": shares, "recurring": recurring,
    })


def settlement_fingerprint(body: SettlementIn) -> str:
    """A repayment typed in by hand: who, to whom, how much, when, the note, and whether it is the
    told money (it changes what happens to the notice: review of #297). That notice's version is
    left out: the notice changes when the first press lands, and a retry must still match. A card
    leaves the day out too (`draft_kind` "card"), so a retry across midnight is the same press."""
    fields = {"from": body.from_member_id, "to": body.to_member_id, "amount": body.amount,
              "note": (body.note or "").strip() or None, "told": body.notice is not None}
    if body.draft_kind == "form":
        fields["settled_at"] = body.settled_at.isoformat()
    return _digest(fields)


def lock_draft(conn: Connection, household_id: int, user_id: int, draft_id: UUID) -> None:
    """Until the transaction ends, no other request of this house, account and identity gets past
    here. Taken after the house lock, so no new lock order appears; two different identities never
    wait on each other (beyond a rare collision of the 64-bit key, which only makes one wait)."""
    key = f"draft:{household_id}:{user_id}:{draft_id}"
    conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (key,))


def find_draft(conn: Connection, kind: Kind, household_id: int, user_id: int,
               draft_id: UUID) -> dict | None:
    """The live record this account made from this draft in this house: its id and fingerprint."""
    return fetch_one(
        conn,
        f"SELECT id, draft_fingerprint FROM {TABLES[kind]}"
        " WHERE household_id = %s AND created_by = %s AND draft_id = %s",
        (household_id, user_id, draft_id),
    )


def already_saved(kind: Kind, record_id: int) -> ApiError:
    """The draft already made a record, and this press says something else (FR-004): nothing is
    changed; the page offers to look at it, or to save what is typed as a new one."""
    what = "expense" if kind == "expense" else "repayment"
    message = f"This draft was already saved as another {what}; look at it, or save a new one"
    return ApiError(409, "draft_already_saved", message, {"kind": kind, "id": record_id})


def repeat_of(conn: Connection, kind: Kind, household_id: int, user_id: int, draft_id: UUID,
              fingerprint: str) -> int | None:
    """Steps 2 and 3: the id of the record this draft already made, when the press repeats it
    exactly (None: a first save). Raises `already_saved()` when it says something else."""
    lock_draft(conn, household_id, user_id, draft_id)
    return matching(conn, kind, household_id, user_id, draft_id, fingerprint)


def matching(conn: Connection, kind: Kind, household_id: int, user_id: int, draft_id: UUID,
             fingerprint: str) -> int | None:
    """`find_draft()` and the comparison, without the lock: also used after a unique index refused
    the insert (FR-007), where the lock is already held."""
    found = find_draft(conn, kind, household_id, user_id, draft_id)
    if found is None:
        return None
    if found["draft_fingerprint"] != fingerprint:
        raise already_saved(kind, found["id"])
    return found["id"]
