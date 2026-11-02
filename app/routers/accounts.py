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
    count_hit,
    hash_password,
    hits,
    not_authenticated,
    open_session,
    password_matches,
    request_ip,
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
REGISTER_PER_IP = 10
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
    ip = request_ip(request)
    password_hash = hash_password(body.password)  # slow on purpose: before taking a connection
    bucket = f"register-ip:{ip}"
    with connection(request) as conn:
        if hits(conn, bucket, REGISTER_WINDOW) >= REGISTER_PER_IP:
            raise too_many(REGISTER_WINDOW)
        count_hit(conn, bucket, REGISTER_WINDOW)
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
    session = None
    with connection(request) as conn:
        if (
            hits(conn, email_bucket, LOGIN_WINDOW) >= LOGIN_PER_EMAIL
            or hits(conn, ip_bucket, LOGIN_WINDOW) >= LOGIN_PER_IP
        ):
            raise too_many(LOGIN_WINDOW)
        user = fetch_one(
            conn,
            "SELECT id, email, display_name, password_hash FROM users WHERE lower(email) = %s",
            (body.email,),
        )
        if password_matches(user["password_hash"] if user else None, body.password):
            user.pop("password_hash")
            session = {"token": open_session(conn, user["id"]), "user": user}
        else:  # counted, then committed when the `with` ends, then refused
            count_hit(conn, email_bucket, LOGIN_WINDOW)
            count_hit(conn, ip_bucket, LOGIN_WINDOW)
    if session is None:
        raise invalid_credentials()
    return session


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
    user_bucket = ip_bucket = None
    result = None
    with connection(request) as conn:
        user = user_for_token(conn, bearer_token(authorization))
        if user is None:
            raise not_authenticated()
        user_bucket = f"join-user:{user['id']}"
        ip_bucket = f"join-ip:{request_ip(request)}"
        if (
            hits(conn, user_bucket, JOIN_WINDOW) >= JOIN_PER_USER
            or hits(conn, ip_bucket, JOIN_WINDOW) >= JOIN_PER_IP
        ):
            raise too_many(JOIN_WINDOW)
        code = normal_code(body.code)
        found = code and fetch_one(
            conn,
            "SELECT household_id FROM invite_codes"
            " WHERE code = %s AND revoked_at IS NULL AND expires_at > now()",
            (code,),
        )
        if not found:
            count_hit(conn, user_bucket, JOIN_WINDOW)
            count_hit(conn, ip_bucket, JOIN_WINDOW)
        else:
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
    for a household that already has an owner is told so: its holder was invited once."""
    row = fetch_one(
        conn,
        "SELECT id, name, access_key, EXISTS (SELECT 1 FROM household_users hu"
        " WHERE hu.household_id = h.id AND hu.role = 'owner') AS owned"
        f" FROM households h WHERE id = %s{' FOR UPDATE' if lock else ''}",
        (household_id,),
    )
    if row is None or not key or not hmac.compare_digest(row["access_key"].encode(), key.encode()):
        raise household_not_found()
    if row["owned"]:
        raise ApiError(
            409, "household_has_owner", "This household has an owner: ask them for an invite code"
        )
    return row


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
    conn.execute(
        "INSERT INTO household_users (household_id, user_id, role, member_id, approved_at)"
        " VALUES (%s, %s, 'owner', %s, now())"
        " ON CONFLICT (household_id, user_id) DO UPDATE"
        " SET role = 'owner', member_id = EXCLUDED.member_id, approved_at = now()",
        (household_id, user["id"], member_id),
    )
