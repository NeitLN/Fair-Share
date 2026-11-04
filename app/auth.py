"""Accounts: passwords, sessions and the signed-in user of a request (docs/ACCOUNTS.md).

* Passwords are hashed with argon2id at OWASP's minimum (2 passes, 19 MiB, 1 lane). An
  unknown email is checked against a dummy hash, so both wrong answers take the same time.
* A login opens a session: a random 32-byte token for the browser, only its SHA-256 in the
  database. It travels in `Authorization: Bearer …`, never in a cookie: the web app and the API are
  two different sites on Render (onrender.com is a public suffix), and a header needs no CSRF guard.
* A session ends 30 days after it was last used, and 90 days after the login at the latest.
  Logging out deletes it, so the token stops working at once.
* Counters in `rate_limits` slow down guessing: they live in the database, so a restart or a second
  instance does not reset them.
"""

import hashlib
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, Header, Request
from psycopg import Connection

from app.client_ip import pick_client_ip
from app.db import ConnDep, fetch_one
from app.errors import ApiError

IDLE_LIFETIME = timedelta(days=30)
MAX_LIFETIME = timedelta(days=90)
# Writing last_used_at on every request is not needed: once an hour is enough for a 30-day limit
TOUCH_EVERY = timedelta(hours=1)

# OWASP's minimum for argon2id (t=2, 19 MiB, 1 lane). The library defaults (t=3, 64 MiB, 4 lanes)
# took about 4 s per login in a container limited like Render's free instance (0.1 CPU, 512 MB),
# against about 0.4 s with these (#166 review).
# Argon2 keeps its settings in each hash, so hashes made with the old ones still verify, and a login
# makes them again with these (needs_rehash)
_hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
# Checked when the email is unknown, so the answer takes as long as for a wrong password
_DUMMY_HASH = _hasher.hash("not a real password, only spends the same time")
# Each hash or check takes 19 MiB and most of the free instance's 0.1 CPU: at most two at a time, so
# a burst of logins or sign-ups waits instead of slowing down every other request (review of #166)
HASHING_AT_ONCE = 2
_hashing = threading.BoundedSemaphore(HASHING_AT_ONCE)


def not_authenticated() -> ApiError:
    return ApiError(401, "not_authenticated", "Sign in to continue")


def forbidden(message: str = "You are not allowed to do this in this household") -> ApiError:
    return ApiError(403, "forbidden", message)


def hash_password(password: str) -> str:
    with _hashing:
        return _hasher.hash(password)


def needs_rehash(stored_hash: str) -> bool:
    """The hash was made with other settings than today's: make it again while the password is
    known."""
    try:
        return _hasher.check_needs_rehash(stored_hash)
    except InvalidHashError:
        return False


def password_matches(stored_hash: str | None, password: str) -> bool:
    try:
        with _hashing:
            return _hasher.verify(stored_hash or _DUMMY_HASH, password) and stored_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def open_session(conn: Connection, user_id: int) -> str:
    """A new session for this login. The account's ended sessions are removed here: a request with
    one gets a 401, and its transaction rolls back, so it cannot remove the session itself."""
    conn.execute(
        "DELETE FROM sessions WHERE user_id = %s"
        " AND (expires_at <= now() OR created_at <= now() - %s)",
        (user_id, MAX_LIFETIME),
    )
    token = new_token()
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (%s, %s, now() + %s)",
        (token_hash(token), user_id, IDLE_LIFETIME),
    )
    return token


def bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token or len(token) > 200:
        return None
    return token


def user_for_token(conn: Connection, token: str | None) -> dict | None:
    """The signed-in user, or None. Extends the session while it is in use (sliding, capped)."""
    if token is None:
        return None
    digest = token_hash(token)
    row = fetch_one(
        conn,
        "SELECT u.id, u.email, u.display_name, s.created_at, s.last_used_at, s.expires_at"
        " FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = %s",
        (digest,),
    )
    if row is None:
        return None
    now = datetime.now(timezone.utc)
    if row["expires_at"] <= now or row["created_at"] + MAX_LIFETIME <= now:
        return None  # removed at the account's next login (open_session)
    if now - row["last_used_at"] >= TOUCH_EVERY:
        # Only if the session still exists: a logout in between must not bring it back
        conn.execute(
            "UPDATE sessions SET last_used_at = now(),"
            " expires_at = least(now() + %s, created_at + %s) WHERE token_hash = %s",
            (IDLE_LIFETIME, MAX_LIFETIME, digest),
        )
    return {"id": row["id"], "email": row["email"], "display_name": row["display_name"]}


def current_user(
    request: Request, conn: ConnDep, authorization: Annotated[str | None, Header()] = None
) -> dict:
    """Dependency: the signed-in user, or 401. Shares the request's connection (ConnDep)."""
    user = user_for_token(conn, bearer_token(authorization))
    if user is None:
        raise not_authenticated()
    request.state.user = user
    return user


CurrentUser = Annotated[dict, Depends(current_user)]


# --- Guessing limits -------------------------------------------------------------------------


def request_ip(request: Request) -> str:
    """The visitor's address, read the same way as for Quick add (FORWARDED_HOPS)."""
    peer = request.client.host if request.client else None
    hops = request.app.state.settings.forwarded_hops
    return pick_client_ip(request.headers.get("x-forwarded-for", ""), peer, hops)


def _window_start(window: timedelta) -> datetime:
    seconds = int(window.total_seconds())
    now = int(datetime.now(timezone.utc).timestamp())
    return datetime.fromtimestamp(now - now % seconds, timezone.utc)


def seconds_left(window: timedelta) -> int:
    left = _window_start(window) + window - datetime.now(timezone.utc)
    return max(1, int(left.total_seconds()))


def reserve(conn: Connection, bucket: str, window: timedelta, limit: int) -> bool:
    """Counts this attempt and says whether it is within `limit`, in one statement: two requests at
    the same moment get different counts, so neither slips past the limit (review of #166). The
    caller commits it before answering, and gives it back with release() when it went well."""
    count = conn.execute(
        "INSERT INTO rate_limits (bucket, window_start, hits) VALUES (%s, %s, 1)"
        " ON CONFLICT (bucket, window_start) DO UPDATE SET hits = rate_limits.hits + 1"
        " RETURNING hits",
        (bucket, _window_start(window)),
    ).fetchone()[0]
    # Old windows are of no use; a few rows at a time keeps the table small
    conn.execute(
        "DELETE FROM rate_limits WHERE ctid IN (SELECT ctid FROM rate_limits"
        " WHERE window_start < now() - interval '1 day' LIMIT 50)"
    )
    return count <= limit


def release(conn: Connection, bucket: str, window: timedelta) -> None:
    """An attempt that went well does not count against the limit."""
    conn.execute(
        "UPDATE rate_limits SET hits = greatest(hits - 1, 0)"
        " WHERE bucket = %s AND window_start = %s",
        (bucket, _window_start(window)),
    )


def too_many(window: timedelta) -> ApiError:
    error = ApiError(
        429, "too_many_attempts", f"Too many attempts. Try again in {seconds_left(window)} seconds"
    )
    error.retry_after = seconds_left(window)
    return error
