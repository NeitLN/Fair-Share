"""The signed-in person's own account: their name everywhere and their password
(specs/010-profile-page, docs/ACCOUNTS.md).

The password route opens its own connections, as login does (app/routers/accounts.py): a wrong
current password must stay counted, so the count is committed before the answer, and no connection
is held while the slow hash runs.
"""

from typing import Annotated

from fastapi import APIRouter, Header, Request
from psycopg import errors

from app.auth import (
    CurrentUser,
    bearer_token,
    hash_password,
    not_authenticated,
    password_matches,
    release,
    request_ip,
    reserve,
    token_hash,
    too_many,
    user_for_token,
    wrong_password,
)
from app.db import ConnDep, connection, fetch_all, fetch_one
from app.routers import accounts
from app.schemas import MeIn, PasswordIn, RenameResult

router = APIRouter(prefix="/api", tags=["me"])

Authorization = Annotated[str | None, Header()]
# The unique index that says a name is taken in a household (db/migrations/001_init.sql)
NAME_TAKEN = "members_household_name_key"


@router.patch("/me", response_model=RenameResult)
def rename_me(body: MeIn, user: CurrentUser, conn: ConnDep):
    """The display name and the person's own name in every household they are in, in one
    transaction. A household where someone else already has the name keeps the old one (FR-007);
    any other failure leaves everything as it was (FR-010)."""
    conn.execute("SELECT 1 FROM users WHERE id = %s FOR UPDATE", (user["id"],))
    renamed = fetch_one(
        conn,
        "UPDATE users SET display_name = %s WHERE id = %s RETURNING id, email, display_name",
        (body.display_name, user["id"]),
    )
    # Owner or member only: a person still waiting has no name yet (FR-009). Locked in a fixed
    # order, so two renames at the same moment cannot wait on each other.
    names = fetch_all(
        conn,
        "SELECT hu.household_id, h.name AS household_name, m.id AS member_id, m.name"
        " FROM household_users hu"
        " JOIN households h ON h.id = hu.household_id"
        " JOIN members m ON m.id = hu.member_id"
        " WHERE hu.user_id = %s AND hu.role IN ('owner', 'member')"
        " ORDER BY hu.household_id FOR UPDATE OF hu, m",
        (user["id"],),
    )
    kept = []
    for name in names:
        try:
            with conn.transaction():  # a savepoint: a taken name undoes this household only
                conn.execute(
                    "UPDATE members SET name = %s WHERE id = %s",
                    (body.display_name, name["member_id"]),
                )
        except errors.UniqueViolation as error:
            if error.diag.constraint_name != NAME_TAKEN:
                raise
            kept.append(
                {
                    "household_id": name["household_id"],
                    "household_name": name["household_name"],
                    "name": name["name"],
                }
            )
    return {"user": renamed, "kept": kept}


@router.post("/me/password", status_code=204)
def change_password(body: PasswordIn, request: Request, authorization: Authorization = None):
    """A new password with the current one. Wrong current passwords count in the login limits
    (ACCOUNTS.md A2); after the change every other session of the account ends (FR-015)."""
    token = bearer_token(authorization)
    with connection(request) as conn:
        user = user_for_token(conn, token)
    if user is None:
        raise not_authenticated()
    email_bucket = f"login-email:{user['email'].lower()}"
    ip_bucket = f"login-ip:{request_ip(request)}"
    with connection(request) as conn:
        allowed = reserve(conn, email_bucket, accounts.LOGIN_WINDOW, accounts.LOGIN_PER_EMAIL) and (
            reserve(conn, ip_bucket, accounts.LOGIN_WINDOW, accounts.LOGIN_PER_IP)
        )
        stored = allowed and fetch_one(
            conn, "SELECT password_hash FROM users WHERE id = %s", (user["id"],)
        )
    if not allowed:
        raise too_many(accounts.LOGIN_WINDOW)
    verified = stored["password_hash"] if stored else None
    if not password_matches(verified, body.current_password):
        raise wrong_password()  # the attempt stays counted
    new_hash = hash_password(body.new_password)  # slow on purpose: without holding a connection
    with connection(request) as conn:
        # Under the row lock login takes before opening a session: a login that checked the old
        # password either opened its session before this (and loses it here) or sees the new hash
        current = fetch_one(
            conn, "SELECT password_hash FROM users WHERE id = %s FOR UPDATE", (user["id"],)
        )
        # Changed since it was checked: a second press, or another change at the same moment
        unchanged = current is not None and current["password_hash"] == verified
        if unchanged:
            conn.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s", (new_hash, user["id"])
            )
            conn.execute(
                "DELETE FROM sessions WHERE user_id = %s AND token_hash <> %s",
                (user["id"], token_hash(token)),
            )
            release(conn, email_bucket, accounts.LOGIN_WINDOW)
            release(conn, ip_bucket, accounts.LOGIN_WINDOW)
    if not unchanged:
        raise wrong_password()
