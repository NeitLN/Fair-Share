"""Settlements: one member paying another back (US-08). docs/ARCHITECTURE.md §5.

A repayment is recorded by the person who received it: "Đã nhận" confirms money that reached
them, so nobody can mark someone else's debt as paid (docs/ACCOUNTS.md). The owner can delete a
mistaken one; there is no edit: it is deleted and entered again.
"""

import hashlib
from typing import Annotated

from fastapi import APIRouter, Query, Response
from psycopg import Connection, errors

from app.access import (
    AccessDep,
    HouseholdAccess,
    household_not_found,
    member_not_found,
    require_owner_or_author,
    settlement_not_found,
)
from app.auth import forbidden
from app.db import ConnDep, fetch_all, fetch_one
from app.errors import ApiError
from app.routers.balances import compute
from app.routers.households import lock_household
from app.schemas import (
    BIGINT_MAX,
    MAX_AMOUNT,
    Id,
    Notice,
    NoticeAccept,
    NoticeAdd,
    NoticeAnswer,
    NoticeIn,
    PaymentDetails,
    Settlement,
    SettlementIn,
)
from app.services.vietqr import bank_for, payment_state, transfer_message

# A session and an approved member are required, also for /settlements/{id} through its household
# (app/access.py)
router = APIRouter(prefix="/api", tags=["settlements"], dependencies=[HouseholdAccess])

SETTLEMENT_COLUMNS = (
    "id, household_id, from_member_id, to_member_id, amount, settled_at, note, created_at,"
    " created_by, notice_amount"
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
    """A repayment typed in by hand. With `notice`, it is the money the payer told about: it is
    taken out of that notice (all of it at most) in the same transaction, so the same money can
    never be recorded again by confirming the notice. Without it, no notice changes (specs/014,
    FR-008): today's "same amount answers the notice" guess is gone, it let money count twice."""
    if body.from_member_id == body.to_member_id:
        raise ApiError(422, "same_member", "A member cannot pay themselves")
    lock_household(conn, household_id, shared=True)
    found = conn.execute(
        "SELECT count(*) FROM members WHERE household_id = %s AND id IN (%s, %s)",
        (household_id, body.from_member_id, body.to_member_id),
    ).fetchone()[0]
    if found != 2:
        raise unknown_member()
    if body.to_member_id != access.member_id:
        raise forbidden("Only the person who received the money can record it")
    taken = None
    if body.notice is not None:
        notice = current_notice(conn, household_id, body.from_member_id, body.to_member_id)
        expect_version(notice, body.notice.version)
        taken = min(body.amount, notice["amount"])
        take_from_notice(conn, notice, taken)
    return insert_settlement(
        conn, household_id, body.from_member_id, body.to_member_id, body.amount,
        body.settled_at, body.note or None, access.user_id, taken,
    )


def insert_settlement(conn: Connection, household_id: int, from_member: int, to_member: int,
                      amount: int, settled_at, note: str | None, user_id: int,
                      notice_amount: int | None) -> dict:
    try:
        return fetch_one(
            conn,
            "INSERT INTO settlements (household_id, from_member_id, to_member_id, amount,"
            " settled_at, note, created_by, notice_amount)"
            f" VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING {SETTLEMENT_COLUMNS}",
            (household_id, from_member, to_member, amount, settled_at, note, user_id,
             notice_amount),
        )
    except errors.ForeignKeyViolation:  # a member was removed while this request ran
        raise unknown_member() from None


# --- "Tôi đã chuyển" (docs/ACCOUNTS.md, S3; specs/014-partial-transfer-notices) ------------------
#
# A notice is money the payer told the receiver about that the receiver has not recorded yet.
# Every change gives it a new version (one sequence for all notices), and every action names the
# version its screen showed: an action from an old screen is refused before anything changes.

NOTICE_COLUMNS = "from_member_id, to_member_id, amount, status, note, version, created_at"


def raise_notice_changed() -> None:
    raise notice_changed()


def suggestion_changed() -> ApiError:
    message = "This transfer is not suggested any more, or not this much; reload the balances"
    return ApiError(409, "suggestion_changed", message)


def suggested_amount(transfers, from_member: int, to_member: int) -> int | None:
    """What `from` is suggested to send `to` right now (None: no such transfer)."""
    return next((amount for debtor, creditor, amount in transfers
                 if (debtor, creditor) == (from_member, to_member)), None)


def warning_required(suggestion: int) -> ApiError:
    """More than the suggestion, and the person was not shown that yet (specs/019, FR-006)."""
    message = "This is more than is suggested right now; confirm it with warned_suggestion"
    return ApiError(409, "warning_required", message, {"suggestion": suggestion})


def notice_changed() -> ApiError:
    message = "This notice was taken back, answered or told again since this screen showed it"
    return ApiError(409, "notice_changed", message)


def current_notice(conn: Connection, household_id: int, from_member: int,
                   to_member: int) -> dict | None:
    """The pair's notice, locked until the transaction ends (or None)."""
    return fetch_one(
        conn,
        f"SELECT {NOTICE_COLUMNS} FROM payment_notices"
        " WHERE household_id = %s AND from_member_id = %s AND to_member_id = %s FOR UPDATE",
        (household_id, from_member, to_member),
    )


def expect_version(notice: dict | None, version: int | None) -> dict | None:
    """The screen saw `version` (None: no notice for this pair). Anything else changed since."""
    if (notice["version"] if notice else None) != version:
        raise notice_changed()
    return notice


def take_from_notice(conn: Connection, notice: dict, amount: int) -> None:
    """`amount` of the notice has been recorded: what is left keeps waiting (in its state)."""
    # A version belongs to one notice only (one sequence for all). The row is locked, and the
    # statement names the version again, so it changes that notice or nothing
    if amount >= notice["amount"]:
        changed = conn.execute(
            "DELETE FROM payment_notices WHERE version = %s", (notice["version"],)
        ).rowcount
    else:
        changed = conn.execute(
            "UPDATE payment_notices"
            " SET amount = amount - %s, version = nextval('notice_versions')"
            " WHERE version = %s AND amount > %s",
            (amount, notice["version"], amount),
        ).rowcount
    if changed != 1:
        raise notice_changed()


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

    Only a transfer suggested right now can be told, for any amount up to it (specs/014: money
    often goes in parts): the one who owes tells the one they owe. The household is locked first,
    so no expense or repayment can change the balances between the check and the write. Order of
    refusals: the notice changed (409 notice_changed), then the suggestion did (409
    suggestion_changed)."""
    if body.to_member_id == access.member_id:
        raise ApiError(422, "same_member", "A member cannot pay themselves")
    lock_household(conn, household_id)
    balances, transfers = compute(conn, household_id)
    if body.to_member_id not in {row["member_id"] for row in balances}:
        raise unknown_member()
    expect_version(current_notice(conn, household_id, access.member_id, body.to_member_id),
                   body.version)
    ceiling = suggested_amount(transfers, access.member_id, body.to_member_id)
    if ceiling is None or body.amount > ceiling:
        raise suggestion_changed()
    try:
        return fetch_one(
            conn,
            "INSERT INTO payment_notices"
            " (household_id, from_member_id, to_member_id, amount, note, created_by)"
            " VALUES (%s, %s, %s, %s, %s, %s)"
            " ON CONFLICT (household_id, from_member_id, to_member_id) DO UPDATE"
            " SET amount = excluded.amount, note = excluded.note, status = 'sent',"
            " created_by = excluded.created_by, created_at = now(),"
            " version = nextval('notice_versions')"
            # Replaces only the notice this screen showed (a new one never matches a null)
            " WHERE payment_notices.version = %s"
            f" RETURNING {NOTICE_COLUMNS}",
            (household_id, access.member_id, body.to_member_id, body.amount, body.note or None,
             access.user_id, body.version),
        ) or raise_notice_changed()
    except errors.ForeignKeyViolation:  # removed while this request ran
        raise unknown_member() from None


@router.post("/households/{household_id}/notices/{to_member}/add", response_model=Notice)
def add_to_notice(household_id: Id, to_member: Id, body: NoticeAdd, access: AccessDep,
                  conn: ConnDep):
    """"Báo thêm": the payer sent `amount` more and adds it to the notice still waiting, so the
    receiver confirms the total once. Only on a notice not answered "Chưa nhận được" (telling again
    replaces that one). Same order as telling: the house, then the notice's version, then the
    ceiling: the total stays within today's suggestion and the 10^12 limit."""
    lock_household(conn, household_id)
    _, transfers = compute(conn, household_id)
    notice = expect_version(current_notice(conn, household_id, access.member_id, to_member),
                            body.version)
    if notice is None or notice["status"] != "sent":
        raise notice_changed()
    total = notice["amount"] + body.amount
    if total > MAX_AMOUNT:
        raise ApiError(422, "amount_too_large", "A notice cannot be more than 10^12 đồng")
    ceiling = suggested_amount(transfers, access.member_id, to_member)
    if ceiling is None or total > ceiling:
        raise suggestion_changed()
    note = (body.note or None) if "note" in body.model_fields_set else notice["note"]
    return fetch_one(
        conn,
        "UPDATE payment_notices SET amount = %s, note = %s, version = nextval('notice_versions')"
        f" WHERE version = %s RETURNING {NOTICE_COLUMNS}",
        (total, note, notice["version"]),
    ) or raise_notice_changed()


@router.delete("/households/{household_id}/notices/{to_member}", status_code=204)
def cancel_notice(household_id: Id, to_member: Id, access: AccessDep, conn: ConnDep,
                  version: Annotated[int, Query(ge=1, le=BIGINT_MAX)]):
    """The payer takes their own notice back (pressed by mistake, or after "Chưa nhận được"),
    the version their screen showed. Nobody else can: someone else has no notice to this person."""
    notice = current_notice(conn, household_id, access.member_id, to_member)
    expect_version(notice, version)
    take_from_notice(conn, notice, notice["amount"])


@router.post(
    "/households/{household_id}/notices/{from_member}/accept",
    response_model=Settlement,
    status_code=201,
)
def accept_notice(
    household_id: Id, from_member: Id, body: NoticeAccept, access: AccessDep, conn: ConnDep
):
    """The receiver's "Đã nhận" on a waiting notice: records `received` (all of it when left out,
    else "Nhận số khác") and takes it out of the notice, in one transaction. The notice row is
    locked and its version checked first, so a second press, another tab, or a retry after a lost
    answer records nothing.

    More than the pair's suggestion right now is recorded only when the person was warned about
    that very suggestion (specs/019, FR-006): without `warned_suggestion` the answer is 409
    warning_required with the suggestion, with another one 409 suggestion_changed. The house is
    held exclusively, as for telling, so the suggestion checked is the one at commit, and two
    confirmations on different pairs cannot pass it together."""
    lock_household(conn, household_id)
    _, transfers = compute(conn, household_id)
    notice = expect_version(
        current_notice(conn, household_id, from_member, access.member_id), body.version
    )
    if notice is None or notice["status"] != "sent":
        raise notice_changed()
    received = body.received or notice["amount"]
    if received > notice["amount"]:
        message = "More than was told cannot be confirmed from this notice"
        raise ApiError(422, "more_than_told", message)
    ceiling = suggested_amount(transfers, from_member, access.member_id) or 0
    if received > ceiling:
        if body.warned_suggestion is None:
            raise warning_required(ceiling)
        if body.warned_suggestion != ceiling:
            raise suggestion_changed()
    take_from_notice(conn, notice, received)
    return insert_settlement(
        conn, household_id, from_member, access.member_id, received, body.settled_at,
        notice["note"], access.user_id, received,
    )


@router.post(
    "/households/{household_id}/notices/{from_member}/decline", response_model=Notice
)
def decline_notice(
    household_id: Id, from_member: Id, body: NoticeAnswer, access: AccessDep, conn: ConnDep
):
    """The receiver's "Chưa nhận được" on the notice they were shown. It keeps its amount and note
    on the payer's card until they tell again or take it back; money the receiver later records
    as the told money is taken out of it."""
    notice = expect_version(
        current_notice(conn, household_id, from_member, access.member_id), body.version
    )
    if notice is None or notice["status"] != "sent":
        raise notice_changed()
    return fetch_one(
        conn,
        "UPDATE payment_notices SET status = 'declined', version = nextval('notice_versions')"
        f" WHERE version = %s RETURNING {NOTICE_COLUMNS}",
        (notice["version"],),
    )


@router.delete("/settlements/{settlement_id}", status_code=204)
def delete_settlement(settlement_id: Id, access: AccessDep, conn: ConnDep):
    """Deleting a repayment recorded from a notice puts exactly that amount back into the pair's
    notice (specs/019, FR-007, replacing specs/014 FR-011a): added to a waiting one, a new one
    when there is none, and a "Chưa nhận được" one waits again with both amounts. Its note and
    who told it stay. More than 10^12 in all refuses the deletion and changes nothing (FR-008).

    The house is held exclusively, then the notice row, so no telling, confirmation, decline,
    take-back or other deletion of the same house runs in between (FR-009)."""
    lock_household(conn, access.household_id)
    row = fetch_one(
        conn,
        "SELECT created_by, household_id, from_member_id, to_member_id, notice_amount"
        " FROM settlements WHERE id = %s FOR UPDATE",
        (settlement_id,),
    )
    if row is None:
        raise settlement_not_found()
    require_owner_or_author(access, row["created_by"])
    conn.execute("DELETE FROM settlements WHERE id = %s", (settlement_id,))
    if row["notice_amount"]:
        waiting = current_notice(conn, row["household_id"], row["from_member_id"],
                                 row["to_member_id"])
        if waiting is not None and waiting["amount"] + row["notice_amount"] > MAX_AMOUNT:
            # Raising rolls the whole request back: the repayment is still there
            raise ApiError(422, "amount_too_large", "A notice cannot be more than 10^12 đồng")
        fetch_one(
            conn,
            "INSERT INTO payment_notices"
            " (household_id, from_member_id, to_member_id, amount, created_by)"
            # Told by the payer, not by whoever deleted the repayment (their account, if any)
            " SELECT %s, %s, %s, %s,"
            "   (SELECT user_id FROM household_users WHERE household_id = %s AND member_id = %s)"
            " WHERE EXISTS (SELECT 1 FROM members WHERE household_id = %s AND id = %s)"
            "   AND EXISTS (SELECT 1 FROM members WHERE household_id = %s AND id = %s)"
            " ON CONFLICT (household_id, from_member_id, to_member_id) DO UPDATE"
            " SET amount = payment_notices.amount + excluded.amount, status = 'sent',"
            " version = nextval('notice_versions')"
            " RETURNING amount",
            (row["household_id"], row["from_member_id"], row["to_member_id"],
             row["notice_amount"], row["household_id"], row["from_member_id"],
             row["household_id"], row["from_member_id"], row["household_id"],
             row["to_member_id"]),
        )


# --- Paying by VietQR (specs/016-vietqr, US2, US3) -
#
# Who sees a receiving account is decided here, per house (FR-007 to FR-011), in this order: the
# house (the router's own dependency: the same 404 as a house that does not exist), the member (the
# same 404 as an id that does not exist, unless a current owner or member there), then whether the
# asker is suggested to pay that member right now. Nothing about the account is read before those.
# The house is locked first, so the suggestion, the notice and the amount come from one state
# (FR-013, research R4). Nothing is written; no account data is logged (FR-006).


def payment_not_suggested() -> ApiError:
    message = "No transfer to this person is suggested for you right now"
    return ApiError(409, "payment_not_suggested", message)


@router.get(
    "/households/{household_id}/members/{member_id}/payment", response_model=PaymentDetails,
    response_model_exclude_none=False,
)
def payment_details(household_id: Id, member_id: Id, access: AccessDep, conn: ConnDep,
                    response: Response,
                    acknowledge: Annotated[int | None, Query(ge=1, le=BIGINT_MAX)] = None):
    """What a payer may see to pay `member_id` by VietQR (data-model.md, contracts/api.md)."""
    response.headers["Cache-Control"] = "no-store"
    lock_household(conn, household_id)
    # Checked again under the lock: the asker may have lost their access while waiting for it
    # (review of #269); no membership change can happen now until this transaction ends
    still_here = fetch_one(
        conn,
        "SELECT 1 FROM household_users WHERE household_id = %s AND user_id = %s"
        " AND member_id = %s AND role IN ('owner', 'member')",
        (household_id, access.user_id, access.member_id),
    )
    if still_here is None:
        raise household_not_found()
    receiver = fetch_one(
        conn,
        "SELECT hu.user_id FROM members m JOIN household_users hu"
        " ON hu.household_id = m.household_id AND hu.member_id = m.id"
        " AND hu.role IN ('owner', 'member')"
        " WHERE m.id = %s AND m.household_id = %s",
        (member_id, household_id),
    )
    if receiver is None:
        raise member_not_found()
    if member_id == access.member_id:
        raise payment_not_suggested()
    _, transfers = compute(conn, household_id)
    suggested = next((amount for debtor, creditor, amount in transfers
                      if (debtor, creditor) == (access.member_id, member_id)), None)
    if suggested is None:
        raise payment_not_suggested()

    notice = fetch_one(
        conn,
        "SELECT amount, status, version FROM payment_notices"
        " WHERE household_id = %s AND from_member_id = %s AND to_member_id = %s",
        (household_id, access.member_id, member_id),
    )
    account = fetch_one(
        conn,
        "SELECT bank_bin, account_number, holder_name, version FROM receiving_accounts"
        " WHERE user_id = %s",
        (receiver["user_id"],),
    )
    bank = bank_for(account["bank_bin"]) if account else None
    snapshot = hashlib.sha256(
        f"{access.member_id}:{member_id}:{suggested}:"
        f"{notice['status'] + ':' + str(notice['version']) if notice else '-'}:"
        f"{account['version'] if bank else '-'}".encode()
    ).hexdigest()[:12]
    if bank is None:
        return {"state": "no_account", "snapshot": snapshot}

    state, amount = payment_state(suggested, notice, acknowledge)
    details = {
        "state": state, "suggested": suggested, "amount": amount, "snapshot": snapshot,
        "told": notice["amount"] if notice else None,
        "notice_version": notice["version"] if notice else None,
    }
    if state in ("covered", "declined"):
        return details
    house = fetch_one(conn, "SELECT name FROM households WHERE id = %s", (household_id,))
    payer = fetch_one(conn, "SELECT name FROM members WHERE id = %s", (access.member_id,))
    return {
        **details,
        "account": {"bank_bin": account["bank_bin"], "bank_name": bank["name"],
                    "account_number": account["account_number"],
                    "holder_name": account["holder_name"]},
        "message": transfer_message(house["name"], payer["name"]),
    }
