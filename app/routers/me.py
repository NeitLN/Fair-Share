"""The signed-in person's own account: their name everywhere and their password
(specs/010-profile-page, docs/ACCOUNTS.md).

The password route opens its own connections, as login does (app/routers/accounts.py): a wrong
current password must stay counted, so the count is committed before the answer, and no connection
is held while the slow hash runs.
"""

import hashlib
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Header, Request, Response
from fastapi.concurrency import run_in_threadpool
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
from app.errors import ApiError
from app.routers import accounts
from app.routers.households import pending_requests
from app.schemas import (
    GenderIn,
    Id,
    MeIn,
    MyPhoto,
    MyRequests,
    PasswordIn,
    PhotoVersion,
    RenameResult,
    StatusIn,
    User,
)
from app.services.images import PhotoBusy, PhotoRefused, clean_photo, data_url

router = APIRouter(prefix="/api", tags=["me"])

Authorization = Annotated[str | None, Header()]
# The unique index that says a name is taken in a household (db/migrations/001_init.sql)
NAME_TAKEN = "members_household_name_key"

# What a route answering with the account returns (schemas.User): never the hash or the notice
USER_COLUMNS = "id, email, display_name, status, gender"

# Photos (specs/010-profile-page, FR-023): uploads per hour, and all photos together
PHOTO_WINDOW = timedelta(hours=1)
PHOTO_PER_USER = 10
PHOTO_PER_IP = 30
PHOTO_STORAGE_BYTES = 50 * 1024 * 1024


def unsupported_image() -> ApiError:
    return ApiError(
        415, "unsupported_image", "Choose a JPEG, PNG or WebP picture of at most 512 × 512"
    )


def photo_storage_full() -> ApiError:
    return ApiError(507, "photo_storage_full", "Photo storage is full; no new photo for now")


def photo_busy() -> ApiError:
    return ApiError(503, "busy", "Busy with other photos; try again in a few seconds")


@router.patch("/me", response_model=RenameResult)
def rename_me(body: MeIn, user: CurrentUser, conn: ConnDep):
    """The display name and the person's own name in every household they are in, in one
    transaction. A household where someone else already has the name keeps the old one (FR-007);
    any other failure leaves everything as it was (FR-010)."""
    conn.execute("SELECT 1 FROM users WHERE id = %s FOR UPDATE", (user["id"],))
    renamed = fetch_one(
        conn,
        "UPDATE users SET display_name = %s WHERE id = %s"
        f" RETURNING {USER_COLUMNS}",
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


@router.put("/me/status", response_model=User)
def set_status(body: StatusIn, user: CurrentUser, conn: ConnDep):
    """A short status the person's housemates see, or none (specs/010-profile-page, US3)."""
    return fetch_one(
        conn,
        f"UPDATE users SET status = %s WHERE id = %s RETURNING {USER_COLUMNS}",
        (body.status, user["id"]),
    )


@router.put("/me/gender", response_model=User)
def set_gender(body: GenderIn, user: CurrentUser, conn: ConnDep):
    """An optional gender, kept with the notice the person saw and when (specs/010-profile-page,
    US5); "Không nêu" (null) deletes all three."""
    if body.gender is None:
        sql = (
            "UPDATE users SET gender = NULL, gender_notice = NULL, gender_set_at = NULL"
            f" WHERE id = %s RETURNING {USER_COLUMNS}"
        )
        return fetch_one(conn, sql, (user["id"],))
    sql = (
        "UPDATE users SET gender = %s, gender_notice = %s, gender_set_at = now()"
        f" WHERE id = %s RETURNING {USER_COLUMNS}"
    )
    return fetch_one(conn, sql, (body.gender, body.notice, user["id"]))


@router.put("/me/photo", response_model=PhotoVersion)
async def set_photo(request: Request, authorization: Authorization = None):
    """The raw picture in the body (image/jpeg, image/png or image/webp), within the app's 64 KiB
    limit. Read here, then checked and stored off the event loop."""
    data = await request.body()
    declared = request.headers.get("content-type", "")
    token = bearer_token(authorization)
    return await run_in_threadpool(store_photo, request, token, data, declared)


def store_photo(request: Request, token: str | None, data: bytes, declared: str) -> dict:
    """Counts the upload first (a refused one stays counted, so failures cannot burn the CPU for
    free), re-encodes it (app/services/images.py), and stores it under the storage ceiling."""
    with connection(request) as conn:
        user = user_for_token(conn, token)
    if user is None:
        raise not_authenticated()
    with connection(request) as conn:
        allowed = reserve(conn, f"photo-user:{user['id']}", PHOTO_WINDOW, PHOTO_PER_USER) and (
            reserve(conn, f"photo-ip:{request_ip(request)}", PHOTO_WINDOW, PHOTO_PER_IP)
        )
    if not allowed:
        raise too_many(PHOTO_WINDOW)
    try:
        image = clean_photo(data, declared)
    except PhotoRefused:
        raise unsupported_image() from None
    except PhotoBusy:
        raise photo_busy() from None
    version = hashlib.sha256(image).hexdigest()[:12]
    with connection(request) as conn:
        # One writer at a time, so two uploads at the same moment both count against the ceiling
        conn.execute("SELECT pg_advisory_xact_lock(hashtext('user_photos'))")
        others = conn.execute(
            "SELECT coalesce(sum(octet_length(image)), 0) FROM user_photos WHERE user_id <> %s",
            (user["id"],),
        ).fetchone()[0]
        full = others + len(image) > PHOTO_STORAGE_BYTES
        if not full:
            conn.execute(
                "INSERT INTO user_photos (user_id, image, version) VALUES (%s, %s, %s)"
                " ON CONFLICT (user_id) DO UPDATE SET image = excluded.image,"
                " version = excluded.version, updated_at = now()",
                (user["id"], image, version),
            )
    if full:
        raise photo_storage_full()
    return {"version": version}


@router.delete("/me/photo", status_code=204)
def remove_photo(user: CurrentUser, conn: ConnDep):
    """Back to the initial; nothing is kept."""
    conn.execute("DELETE FROM user_photos WHERE user_id = %s", (user["id"],))


@router.get("/me/photo", response_model=MyPhoto)
def my_photo(user: CurrentUser, conn: ConnDep, response: Response):
    """The caller's own photo, for the profile page, also with no household."""
    response.headers["Cache-Control"] = "no-store"
    row = fetch_one(
        conn, "SELECT version, image FROM user_photos WHERE user_id = %s", (user["id"],)
    )
    if row is None:
        return {"version": None, "data": None}
    return {"version": row["version"], "data": data_url(row["image"])}


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


# --- Requests to join (specs/015-invite-preview) ------------------------------------------------


@router.get("/me/requests", response_model=MyRequests)
def my_requests(user: CurrentUser, conn: ConnDep):
    """The caller's own: requests still waiting (with the house and owner names), the houses they
    are in (ids only), and how other requests ended. No amounts: the house page asks this every 10
    seconds while a request waits. Outcomes older than 30 days are never shown; they are deleted on
    a check made with nothing waiting, so the 10-second checks only read."""
    pending = pending_requests(conn, user["id"])
    if not pending:
        conn.execute(
            "DELETE FROM join_outcomes"
            " WHERE user_id = %s AND happened_at < now() - interval '30 days'",
            (user["id"],),
        )
    joined = conn.execute(
        "SELECT household_id FROM household_users WHERE user_id = %s AND role <> 'pending'"
        " ORDER BY household_id",
        (user["id"],),
    ).fetchall()
    return {
        "pending": pending,
        "joined": [row[0] for row in joined],
        "outcomes": fetch_all(
            conn,
            "SELECT id, household_id, household_name, owner_name, kind, happened_at"
            " FROM join_outcomes"
            " WHERE user_id = %s AND happened_at >= now() - interval '30 days'"
            " ORDER BY happened_at DESC, id DESC",
            (user["id"],),
        ),
    }


@router.delete("/me/outcomes/{outcome_id}", status_code=204)
def dismiss_outcome(outcome_id: Id, user: CurrentUser, conn: ConnDep):
    """"Đã hiểu". Only its owner can; for anyone else it does not exist."""
    gone = conn.execute(
        "DELETE FROM join_outcomes WHERE id = %s AND user_id = %s", (outcome_id, user["id"])
    ).rowcount
    if not gone:
        raise ApiError(404, "outcome_not_found", "No such outcome")
