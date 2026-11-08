"""Households, the names in their split, who is in them and their invite codes (US-01, US-02,
docs/ACCOUNTS.md). docs/ARCHITECTURE.md §5."""

import secrets
from datetime import timedelta

from fastapi import APIRouter, Response
from psycopg import Connection, errors

from app.access import (
    AccessDep,
    HouseholdAccess,
    household_not_found,
    member_not_found,
    require_owner,
)
from app.auth import CurrentUser
from app.db import ConnDep, fetch_all, fetch_one
from app.errors import ApiError
from app.schemas import (
    MAX_PARTICIPANTS,
    ApproveIn,
    HouseholdIn,
    HouseholdPhotos,
    Id,
    InviteCode,
    JoinRequest,
    Member,
    MyHousehold,
    MyHouseholds,
)
from app.services.images import data_url

# Every route here needs a session, and one with a household id in its path an approved member of
# that household (app/access.py)
router = APIRouter(prefix="/api", tags=["households"], dependencies=[HouseholdAccess])

HOUSEHOLD_COLUMNS = "id, name, created_at"
# A member with the role of the account that took the name, if any
# Profile fields come through the live owner or member link only (specs/010-profile-page): a person
# waiting has no linked name, one who left has no link, an old name has no account
SELECT_MEMBERS = (
    "SELECT m.id, m.household_id, m.name, m.created_at, hu.role, hu.user_id,"
    " CASE WHEN hu.role IN ('owner', 'member') THEN u.status END AS status,"
    " CASE WHEN hu.role IN ('owner', 'member') THEN p.version END AS photo_version,"
    " CASE WHEN hu.role IN ('owner', 'member') THEN u.gender END AS gender FROM members m"
    " LEFT JOIN household_users hu ON hu.household_id = m.household_id AND hu.member_id = m.id"
    " LEFT JOIN users u ON u.id = hu.user_id"
    " LEFT JOIN user_photos p ON p.user_id = hu.user_id"
)
# No more members than one expense can be split between, so an equal split for the whole
# household always works (#134)
MAX_MEMBERS = MAX_PARTICIPANTS

# Invite codes: 8 characters of Crockford's base32 (no I, L, O or U, so nothing reads as 1 or 0),
# 40 random bits, shown as ABCD-EFGH. Valid for a week, the time a group chat message stays seen.
CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
CODE_LENGTH = 8
CODE_LIFETIME = timedelta(days=7)


def member_name_taken() -> ApiError:
    return ApiError(409, "member_name_taken", "This household already has a member with that name")


def member_taken() -> ApiError:
    return ApiError(409, "member_taken", "This name is not free: pick another or a new one")


def too_many_members() -> ApiError:
    return ApiError(409, "too_many_members", f"A household has at most {MAX_MEMBERS} members")


def require_household(conn: Connection, household_id: int) -> None:
    if fetch_one(conn, "SELECT 1 FROM households WHERE id = %s", (household_id,)) is None:
        raise household_not_found()


def get_member(conn: Connection, member_id: int) -> dict:
    member = fetch_one(conn, f"{SELECT_MEMBERS} WHERE m.id = %s", (member_id,))
    if member is None:
        raise member_not_found()
    return member


def add_name(conn: Connection, household_id: int, name: str) -> int:
    """A new name in the split. The caller holds the household's row lock (FOR UPDATE), so two
    names added at the same moment cannot both be the last one allowed."""
    count = conn.execute(
        "SELECT count(*) FROM members WHERE household_id = %s", (household_id,)
    ).fetchone()[0]
    if count >= MAX_MEMBERS:
        raise too_many_members()
    try:
        with conn.transaction():  # a savepoint: a taken name leaves the request usable
            return conn.execute(
                "INSERT INTO members (household_id, name) VALUES (%s, %s) RETURNING id",
                (household_id, name),
            ).fetchone()[0]
    except errors.UniqueViolation:
        raise member_name_taken() from None


def lock_household(conn: Connection, household_id: int) -> None:
    sql = "SELECT 1 FROM households WHERE id = %s FOR UPDATE"
    if fetch_one(conn, sql, (household_id,)) is None:
        raise household_not_found()


def new_invite_code(conn: Connection, household_id: int, user_id: int) -> dict:
    """Revokes the current code, if any, and makes a new one.

    The household is locked first, so two renewals at the same moment take turns: the second one
    revokes the first one's new code instead of clashing with it (review of #166)."""
    lock_household(conn, household_id)
    conn.execute(
        "UPDATE invite_codes SET revoked_at = now() WHERE household_id = %s AND revoked_at IS NULL",
        (household_id,),
    )
    for _ in range(5):  # a clash among 2^40 codes is very unlikely; try again if it happens
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        try:
            with conn.transaction():
                return fetch_one(
                    conn,
                    "INSERT INTO invite_codes (code, household_id, created_by, expires_at)"
                    " VALUES (%s, %s, %s, now() + %s) RETURNING code, expires_at",
                    (code, household_id, user_id, CODE_LIFETIME),
                )
        except errors.UniqueViolation:
            continue
    raise ApiError(503, "try_again", "Could not make an invite code. Try again")


def my_household(conn: Connection, household_id: int, user_id: int) -> dict:
    return fetch_one(
        conn,
        "SELECT h.id, h.name, h.created_at, hu.role, hu.member_id FROM households h"
        " JOIN household_users hu ON hu.household_id = h.id AND hu.user_id = %s"
        " WHERE h.id = %s",
        (user_id, household_id),
    )


# --- Households -------------------------------------------------------------------------------


@router.get("/households", response_model=MyHouseholds)
def list_my_households(user: CurrentUser, conn: ConnDep):
    """The households the user is in, and the requests to join still waiting. Only the user's own:
    there is no list of every household."""
    rows = fetch_all(
        conn,
        "SELECT h.id, h.name, h.created_at, hu.role, hu.member_id, hu.requested_at,"
        # What the house owes the caller (or the caller it): the same numbers
        # app/routers/balances.py computes for that member, so a card always matches Tổng quan
        " coalesce((SELECT sum(amount) FROM expenses WHERE payer_id = hu.member_id), 0)::bigint"
        " - coalesce((SELECT sum(share_amount) FROM expense_shares"
        "             WHERE member_id = hu.member_id), 0)::bigint"
        " + coalesce((SELECT sum(amount) FROM settlements"
        "             WHERE from_member_id = hu.member_id), 0)::bigint"
        " - coalesce((SELECT sum(amount) FROM settlements"
        "             WHERE to_member_id = hu.member_id), 0)::bigint AS my_net,"
        # Things waiting for the caller here: join requests if they own the house, and "Tôi đã
        # chuyển" notices sent to them
        " (CASE WHEN hu.role = 'owner' THEN"
        "   (SELECT count(*) FROM household_users"
        "    WHERE household_id = h.id AND role = 'pending') ELSE 0 END)"
        " + (SELECT count(*) FROM payment_notices"
        "    WHERE household_id = h.id AND to_member_id = hu.member_id"
        "      AND status = 'sent') AS waiting"
        " FROM household_users hu JOIN households h ON h.id = hu.household_id"
        " WHERE hu.user_id = %s ORDER BY lower(h.name), h.id",
        (user["id"],),
    )
    return {
        "households": [row for row in rows if row["role"] != "pending"],
        "pending": [
            {"household_id": row["id"], "requested_at": row["requested_at"]}
            for row in rows
            if row["role"] == "pending"
        ],
    }


@router.post("/households", response_model=MyHousehold, status_code=201)
def create_household(body: HouseholdIn, user: CurrentUser, conn: ConnDep):
    """The creator is its owner, with their display name as their name in the split. Its first
    invite code is made at once."""
    sql = f"INSERT INTO households (name) VALUES (%s) RETURNING {HOUSEHOLD_COLUMNS}"
    household = fetch_one(conn, sql, (body.name,))
    member_id = add_name(conn, household["id"], user["display_name"])
    conn.execute(
        "INSERT INTO household_users (household_id, user_id, role, member_id, approved_at)"
        " VALUES (%s, %s, 'owner', %s, now())",
        (household["id"], user["id"], member_id),
    )
    new_invite_code(conn, household["id"], user["id"])
    return {**household, "role": "owner", "member_id": member_id}


@router.get("/households/{household_id}", response_model=MyHousehold)
def get_household(household_id: Id, access: AccessDep, conn: ConnDep):
    return my_household(conn, household_id, access.user_id)


@router.patch("/households/{household_id}", response_model=MyHousehold)
def rename_household(household_id: Id, body: HouseholdIn, access: AccessDep, conn: ConnDep):
    require_owner(access)
    conn.execute("UPDATE households SET name = %s WHERE id = %s", (body.name, household_id))
    return my_household(conn, household_id, access.user_id)


@router.delete("/households/{household_id}", status_code=204)
def delete_household(household_id: Id, access: AccessDep, conn: ConnDep):
    """Removes the household and everything in it, in one transaction.

    Expenses (and with them their shares) go first: a single DELETE of the household would fail,
    see the comment at the top of db/migrations/001_init.sql.
    """
    require_owner(access)
    conn.execute("DELETE FROM expenses WHERE household_id = %s", (household_id,))
    deleted = conn.execute("DELETE FROM households WHERE id = %s", (household_id,)).rowcount
    if not deleted:
        raise household_not_found()


@router.get("/households/{household_id}/photos", response_model=HouseholdPhotos)
def household_photos(household_id: Id, conn: ConnDep, response: Response):
    """Every current owner's and member's photo in one answer (specs/010-profile-page, research
    R2): an <img src> cannot carry the Bearer token, so the page asks once and shows data URLs.
    Checked like every household route; never cached by the browser or a proxy."""
    response.headers["Cache-Control"] = "no-store"
    rows = fetch_all(
        conn,
        "SELECT hu.member_id, p.version, p.image FROM household_users hu"
        " JOIN user_photos p ON p.user_id = hu.user_id"
        " WHERE hu.household_id = %s AND hu.role IN ('owner', 'member') ORDER BY hu.member_id",
        (household_id,),
    )
    return {
        "photos": [
            {"member_id": r["member_id"], "version": r["version"], "data": data_url(r["image"])}
            for r in rows
        ]
    }


@router.get("/households/{household_id}/members", response_model=list[Member])
def list_members(household_id: Id, conn: ConnDep):
    """Oldest first: the equal split gives remainder đồng to the lowest member ids."""
    sql = f"{SELECT_MEMBERS} WHERE m.household_id = %s ORDER BY m.id"
    return fetch_all(conn, sql, (household_id,))


# --- Who is in it (owner) ---------------------------------------------------------------------


@router.get("/households/{household_id}/requests", response_model=list[JoinRequest])
def list_requests(household_id: Id, access: AccessDep, conn: ConnDep):
    require_owner(access)
    return fetch_all(
        conn,
        "SELECT u.id AS user_id, u.display_name, u.email, hu.requested_at"
        " FROM household_users hu JOIN users u ON u.id = hu.user_id"
        " WHERE hu.household_id = %s AND hu.role = 'pending' ORDER BY hu.requested_at, u.id",
        (household_id,),
    )


def pending_request(conn: Connection, household_id: int, user_id: int) -> dict:
    row = fetch_one(
        conn,
        "SELECT u.display_name FROM household_users hu JOIN users u ON u.id = hu.user_id"
        " WHERE hu.household_id = %s AND hu.user_id = %s AND hu.role = 'pending' FOR UPDATE",
        (household_id, user_id),
    )
    if row is None:
        raise ApiError(404, "request_not_found", "This request to join does not exist")
    return row


@router.post("/households/{household_id}/requests/{user_id}/approve", response_model=Member)
def approve_request(
    household_id: Id, user_id: Id, body: ApproveIn, access: AccessDep, conn: ConnDep
):
    """The person becomes a member, linked to a name nobody has taken (their history goes with
    it) or to a new one."""
    require_owner(access)
    lock_household(conn, household_id)
    asking = pending_request(conn, household_id, user_id)
    if body.member_id is not None:
        free = fetch_one(
            conn,
            "SELECT 1 FROM members m WHERE m.id = %s AND m.household_id = %s AND NOT EXISTS"
            " (SELECT 1 FROM household_users hu WHERE hu.household_id = m.household_id"
            " AND hu.member_id = m.id)",
            (body.member_id, household_id),
        )
        if free is None:
            raise member_taken()
        member_id = body.member_id
    else:
        member_id = add_name(conn, household_id, body.name or asking["display_name"])
    try:
        conn.execute(
            "UPDATE household_users SET role = 'member', member_id = %s, approved_at = now()"
            " WHERE household_id = %s AND user_id = %s",
            (member_id, household_id, user_id),
        )
    except errors.UniqueViolation:  # the same name given to two people at the same moment
        raise member_taken() from None
    return get_member(conn, member_id)


@router.post("/households/{household_id}/requests/{user_id}/reject", status_code=204)
def reject_request(household_id: Id, user_id: Id, access: AccessDep, conn: ConnDep):
    require_owner(access)
    pending_request(conn, household_id, user_id)
    sql = "DELETE FROM household_users WHERE household_id = %s AND user_id = %s"
    conn.execute(sql, (household_id, user_id))


@router.delete("/households/{household_id}/people/{user_id}", status_code=204)
def remove_person(household_id: Id, user_id: Id, access: AccessDep, conn: ConnDep):
    """Takes someone's access away. Their name stays, with its expenses: balances do not change."""
    require_owner(access)
    if user_id == access.user_id:
        raise ApiError(409, "owner_cannot_leave", "The owner cannot remove themselves")
    removed = conn.execute(
        "DELETE FROM household_users WHERE household_id = %s AND user_id = %s AND role = 'member'",
        (household_id, user_id),
    ).rowcount
    if not removed:
        raise ApiError(404, "person_not_found", "This person is not a member of this household")


@router.post("/households/{household_id}/leave", status_code=204)
def leave_household(household_id: Id, access: AccessDep, conn: ConnDep):
    if access.is_owner:
        raise ApiError(409, "owner_cannot_leave", "The owner cannot leave the household")
    conn.execute(
        "DELETE FROM household_users WHERE household_id = %s AND user_id = %s",
        (household_id, access.user_id),
    )


# --- Invite codes -----------------------------------------------------------------------------


@router.get("/households/{household_id}/invite", response_model=InviteCode)
def current_invite(household_id: Id, access: AccessDep, conn: ConnDep):
    """Every member can show the current code; when there is none (or it expired) the owner gets
    a new one, a member gets none and asks the owner."""
    current = (
        "SELECT code, expires_at FROM invite_codes"
        " WHERE household_id = %s AND revoked_at IS NULL AND expires_at > now()"
    )
    row = fetch_one(conn, current, (household_id,))
    if row is not None:
        return row
    if not access.is_owner:
        return {"code": None, "expires_at": None}
    # Two of the owner's devices asking at the same moment: the second waits for the lock, then
    # finds and shows the code the first one just made
    lock_household(conn, household_id)
    return fetch_one(conn, current, (household_id,)) or new_invite_code(
        conn, household_id, access.user_id
    )


@router.post("/households/{household_id}/invite", response_model=InviteCode)
def renew_invite(household_id: Id, access: AccessDep, conn: ConnDep):
    """A new code; the old one stops working (someone who already asked to join stays asked)."""
    require_owner(access)
    return new_invite_code(conn, household_id, access.user_id)
