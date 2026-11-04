"""Signing up and in, joining a household with an invite code, and taking over an old household
(docs/ACCOUNTS.md).

The routes that count failed attempts (login, registration, codes) open their own connection
instead of ConnDep: the count must be committed even when the answer is an error, and an error
raised inside ConnDep rolls the whole request back. So they commit first and raise after.
"""

import hmac
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Header, Request
from psycopg import errors

from app.access import household_not_found
from app.auth import (
    CurrentUser,
    bearer_token,
    hash_password,
    needs_rehash,
    not_authenticated,
    open_session,
    password_matches,
    release,
    request_ip,
    reserve,
    token_hash,
    too_many,
    user_for_token,
)
from app.db import ConnDep, connection, fetch_all, fetch_one
from app.errors import ApiError
from app.routers.households import (
    CODE_ALPHABET,
    CODE_LENGTH,
    SELECT_MEMBERS,
    add_name,
    member_taken,
)
from app.schemas import (
    ClaimIn,
    ClaimInfo,
    Id,
    JoinIn,
    JoinResult,
    LoginIn,
    RegisterIn,
    SessionOut,
    User,
)

router = APIRouter(prefix="/api", tags=["accounts"])

KEY_HEADER = "X-Household-Key"
Authorization = Annotated[str | None, Header()]

# Guessing limits (docs/ACCOUNTS.md, A2 and J2)
LOGIN_WINDOW = timedelta(minutes=15)
LOGIN_PER_EMAIL = 5
LOGIN_PER_IP = 20
REGISTER_WINDOW = timedelta(hours=1)
# A class on one campus Wi-Fi shares one address: enough for a room signing up at once, still far
# from a script making accounts by the thousand
REGISTER_PER_IP = 30
JOIN_WINDOW = timedelta(minutes=1)
JOIN_PER_USER = 5
JOIN_PER_IP = 20

# Crockford's base32 reads O as 0 and I or L as 1, so a code copied by hand still works
_LOOKALIKES = str.maketrans({"O": "0", "I": "1", "L": "1"})


def invalid_credentials() -> ApiError:
    return ApiError(401, "invalid_credentials", "The email or the password is not right")


def invalid_code() -> ApiError:
    return ApiError(404, "invalid_code", "This code is not right or has expired")


def normal_code(raw: str) -> str | None:
    code = "".join(raw.split()).replace("-", "").upper().translate(_LOOKALIKES)
    if len(code) != CODE_LENGTH or any(ch not in CODE_ALPHABET for ch in code):
        return None
    return code


# --- Account --------------------------------------------------------------------------------


@router.post("/auth/register", response_model=SessionOut, status_code=201)
def register(body: RegisterIn, request: Request):
    bucket = f"register-ip:{request_ip(request)}"
    # The limit first: a refused request must not cost a password hash (review of #166)
    with connection(request) as conn:
        allowed = reserve(conn, bucket, REGISTER_WINDOW, REGISTER_PER_IP)
    if not allowed:
        raise too_many(REGISTER_WINDOW)
    password_hash = hash_password(body.password)  # slow on purpose: without holding a connection
    with connection(request) as conn:
        try:
            with conn.transaction():
                user = fetch_one(
                    conn,
                    "INSERT INTO users (email, password_hash, display_name) VALUES (%s, %s, %s)"
                    " RETURNING id, email, display_name",
                    (body.email, password_hash, body.display_name),
                )
        except errors.UniqueViolation:
            user = None
        token = open_session(conn, user["id"]) if user else None
    if user is None:
        raise ApiError(409, "email_taken", "There is already an account with this email")
    return {"token": token, "user": user}


@router.post("/auth/login", response_model=SessionOut)
def login(body: LoginIn, request: Request):
    email_bucket = f"login-email:{body.email}"
    ip_bucket = f"login-ip:{request_ip(request)}"
    # Every attempt is counted (and committed) before the password is checked; one that succeeds
    # is given back. So attempts at the same moment cannot slip past the limit together.
    with connection(request) as conn:
        allowed = reserve(conn, email_bucket, LOGIN_WINDOW, LOGIN_PER_EMAIL) and reserve(
            conn, ip_bucket, LOGIN_WINDOW, LOGIN_PER_IP
        )
        user = allowed and fetch_one(
            conn,
            "SELECT id, email, display_name, password_hash FROM users WHERE lower(email) = %s",
            (body.email,),
        )
    if not allowed:
        raise too_many(LOGIN_WINDOW)
    if not password_matches(user["password_hash"] if user else None, body.password):
        raise invalid_credentials()  # the attempt stays counted
    # A hash from older settings is made again now, without holding a connection while it runs
    fresh = hash_password(body.password) if needs_rehash(user["password_hash"]) else None
    with connection(request) as conn:
        release(conn, email_bucket, LOGIN_WINDOW)
        release(conn, ip_bucket, LOGIN_WINDOW)
        if fresh:
            conn.execute("UPDATE users SET password_hash = %s WHERE id = %s", (fresh, user["id"]))
        token = open_session(conn, user["id"])
    user.pop("password_hash")
    return {"token": token, "user": user}


@router.post("/auth/logout", status_code=204)
def logout(conn: ConnDep, authorization: Authorization = None):
    """Ends this session at once: the token stops working everywhere."""
    token = bearer_token(authorization)
    if token is None:
        raise not_authenticated()
    conn.execute("DELETE FROM sessions WHERE token_hash = %s", (token_hash(token),))


@router.get("/auth/me", response_model=User)
def me(user: CurrentUser):
    return user


# --- Joining with an invite code ---------------------------------------------------------------


@router.post("/join", response_model=JoinResult)
def join(body: JoinIn, request: Request, authorization: Authorization = None):
    """Asks to join the household of a valid code. The owner then approves (or not); until then
    the household shows nothing of itself, not even its name."""
    result = None
    with connection(request) as conn:
        user = user_for_token(conn, bearer_token(authorization))
        if user is None:
            raise not_authenticated()
        user_bucket = f"join-user:{user['id']}"
        ip_bucket = f"join-ip:{request_ip(request)}"
        # Counted before the code is looked at, given back when it was right (see login)
        allowed = reserve(conn, user_bucket, JOIN_WINDOW, JOIN_PER_USER) and reserve(
            conn, ip_bucket, JOIN_WINDOW, JOIN_PER_IP
        )
        code = normal_code(body.code) if allowed else None
        found = code and fetch_one(
            conn,
            "SELECT household_id FROM invite_codes"
            " WHERE code = %s AND revoked_at IS NULL AND expires_at > now()",
            (code,),
        )
        if found:
            release(conn, user_bucket, JOIN_WINDOW)
            release(conn, ip_bucket, JOIN_WINDOW)
            household_id = found["household_id"]
            conn.execute(
                "INSERT INTO household_users (household_id, user_id, role)"
                " VALUES (%s, %s, 'pending') ON CONFLICT DO NOTHING",
                (household_id, user["id"]),
            )
            role = conn.execute(
                "SELECT role FROM household_users WHERE household_id = %s AND user_id = %s",
                (household_id, user["id"]),
            ).fetchone()[0]
            result = (
                {"status": "pending"}
                if role == "pending"
                else {"status": "member", "household_id": household_id}
            )
    if not allowed:
        raise too_many(JOIN_WINDOW)
    if result is None:
        raise invalid_code()
    return result


@router.delete("/me/requests/{household_id}", status_code=204)
def cancel_request(household_id: Id, user: CurrentUser, conn: ConnDep):
    cancelled = conn.execute(
        "DELETE FROM household_users WHERE household_id = %s AND user_id = %s AND role = 'pending'",
        (household_id, user["id"]),
    ).rowcount
    if not cancelled:
        raise ApiError(404, "request_not_found", "This request to join does not exist")


# --- Taking over a household from before accounts ----------------------------------------------


def ownerless_household(conn, household_id: int, key: str | None, lock: bool = False) -> dict:
    """The household, if `key` is its old invite key and nobody owns it yet.

    A wrong key gets the 404 of a household that does not exist, as before accounts. A right key
    for a household that already has an owner is told so: its holder was invited once.

    With `lock`, the household is locked in a statement of its own first: a second person claiming
    at the same moment waits, then sees the first one's owner (review of #166). In one statement
    with the lock, its owner check would still read from before the wait.
    """
    if lock:
        conn.execute("SELECT 1 FROM households WHERE id = %s FOR UPDATE", (household_id,))
    row = fetch_one(
        conn,
        "SELECT id, name, access_key, EXISTS (SELECT 1 FROM household_users hu"
        " WHERE hu.household_id = h.id AND hu.role = 'owner') AS owned"
        " FROM households h WHERE id = %s",
        (household_id,),
    )
    if row is None or not key or not hmac.compare_digest(row["access_key"].encode(), key.encode()):
        raise household_not_found()
    if row["owned"]:
        raise household_has_owner()
    return row


def household_has_owner() -> ApiError:
    return ApiError(
        409, "household_has_owner", "This household has an owner: ask them for an invite code"
    )


@router.get("/households/{household_id}/claim", response_model=ClaimInfo)
def claim_info(
    household_id: Id,
    user: CurrentUser,
    conn: ConnDep,
    key: Annotated[str | None, Header(alias=KEY_HEADER)] = None,
):
    household = ownerless_household(conn, household_id, key)
    members = fetch_all(
        conn,
        f"{SELECT_MEMBERS} WHERE m.household_id = %s AND hu.user_id IS NULL ORDER BY m.id",
        (household_id,),
    )
    return {"id": household["id"], "name": household["name"], "members": members}


@router.post("/households/{household_id}/claim", status_code=204)
def claim(
    household_id: Id,
    body: ClaimIn,
    user: CurrentUser,
    conn: ConnDep,
    key: Annotated[str | None, Header(alias=KEY_HEADER)] = None,
):
    """The first signed-in person with the old key becomes the owner, as one of the names already
    there or a new one. From then on the key opens nothing: others join with an invite code."""
    ownerless_household(conn, household_id, key, lock=True)
    if body.member_id is not None:
        free = fetch_one(
            conn,
            f"{SELECT_MEMBERS} WHERE m.id = %s AND m.household_id = %s AND hu.user_id IS NULL",
            (body.member_id, household_id),
        )
        if free is None:
            raise member_taken()
        member_id = body.member_id
    else:
        member_id = add_name(conn, household_id, user["display_name"])
    try:
        conn.execute(
            "INSERT INTO household_users (household_id, user_id, role, member_id, approved_at)"
            " VALUES (%s, %s, 'owner', %s, now())"
            " ON CONFLICT (household_id, user_id) DO UPDATE"
            " SET role = 'owner', member_id = EXCLUDED.member_id, approved_at = now()",
            (household_id, user["id"], member_id),
        )
    except errors.UniqueViolation:  # the last line of defence: one owner per household (003)
        raise household_has_owner() from None
